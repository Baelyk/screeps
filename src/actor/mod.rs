use std::{
    cell::RefCell,
    collections::{BinaryHeap, VecDeque},
    ops::{Deref, DerefMut},
    rc::Rc,
};

use qcell::{QCell, QCellOwner, QCellOwnerID};

pub struct Runtime {
    pub owner: QCellOwner,
    pub core: Core,
}

impl Runtime {
    pub fn run(&mut self, time: u32) {
        // The queue of messages to actually run
        let queue = RefCell::new(VecDeque::new());
        // The queue of messages to add to, to run later
        let defer = self.core.queue.clone();

        // Queue timers
        let timers = self.core.timers.clone();
        let mut timers = timers.borrow_mut();
        while let Some(timer) = timers.peek() {
            if timer.0 <= time {
                let timer = timers.pop().unwrap();
                self.core.queue.borrow_mut().push_back(timer.1)
            } else {
                break;
            }
        }
        drop(timers);

        while !defer.borrow().is_empty() {
            // Swap the queues so messages can send messages
            queue.swap(&defer);
            while let Some(message) = queue.borrow_mut().pop_front() {
                message(self)
            }
        }
    }
}

impl Default for Runtime {
    fn default() -> Self {
        let owner = QCellOwner::new();
        let core = Core::new(owner.id());
        Self { owner, core }
    }
}

impl Deref for Runtime {
    type Target = Core;

    fn deref(&self) -> &Self::Target {
        &self.core
    }
}

impl DerefMut for Runtime {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.core
    }
}

pub struct Timer(u32, Box<dyn FnOnce(&mut Runtime) + 'static>);

impl std::cmp::PartialEq for Timer {
    fn eq(&self, other: &Self) -> bool {
        self.0 == other.0
    }
}

impl std::cmp::Eq for Timer {}

impl std::cmp::PartialOrd for Timer {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl std::cmp::Ord for Timer {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.0.cmp(&other.0).reverse()
    }
}

type MessageQueue = VecDeque<Box<dyn FnOnce(&mut Runtime) + 'static>>;
type TimerHeap = BinaryHeap<Timer>;
pub struct Core {
    pub maker: QCellOwnerID,
    pub queue: Rc<RefCell<MessageQueue>>,
    pub timers: Rc<RefCell<TimerHeap>>,
}

impl Core {
    fn new(maker: QCellOwnerID) -> Self {
        Self {
            maker,
            queue: Default::default(),
            timers: Default::default(),
        }
    }

    pub fn new_actor<T>(&self) -> Actor<T> {
        Actor::new(&self.maker, self.queue.clone(), self.timers.clone())
    }

    pub fn defer(&self, f: impl FnOnce(&mut Runtime) + 'static) {
        self.queue.borrow_mut().push_back(Box::new(f));
    }

    pub fn timer(&self, time: u32, f: impl FnOnce(&mut Runtime) + 'static) {
        self.timers.borrow_mut().push(Timer(time, Box::new(f)));
    }
}

pub struct Context<'a, T: 'static> {
    pub core: &'a mut Core,
    pub actor: &'a Actor<T>,
}

impl<'a, T> Deref for Context<'a, T> {
    type Target = Core;

    fn deref(&self) -> &Self::Target {
        self.core
    }
}

impl<'a, T> DerefMut for Context<'a, T> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        self.core
    }
}

impl<'a, T> Context<'a, T> {
    pub fn actor(&self) -> Actor<T> {
        self.actor.clone()
    }
}

pub struct Actor<T: 'static> {
    actor: Rc<QCell<Inner<T>>>,
    queue: Rc<RefCell<MessageQueue>>,
    timers: Rc<RefCell<TimerHeap>>,
}

struct Pre(MessageQueue);

enum Inner<T> {
    Pre(Pre),
    Ready(T),
}

impl<T> Clone for Actor<T> {
    fn clone(&self) -> Self {
        Self {
            actor: self.actor.clone(),
            queue: self.queue.clone(),
            timers: self.timers.clone(),
        }
    }
}

impl<T> Actor<T> {
    pub fn new(
        owner: &QCellOwnerID,
        queue: Rc<RefCell<MessageQueue>>,
        timers: Rc<RefCell<TimerHeap>>,
    ) -> Self {
        Actor {
            actor: Rc::new(owner.cell(Inner::Pre(Pre(VecDeque::new())))),
            queue,
            timers,
        }
    }

    pub fn actor(&self) -> Actor<T> {
        self.clone()
    }

    fn borrow_ready<'a>(&'a self, owner: &'a mut QCellOwner) -> Option<&'a mut T> {
        match owner.rw(&self.actor) {
            Inner::Ready(actor) => Some(actor),
            _ => None,
        }
    }

    fn borrow_pre<'a>(&'a self, owner: &'a mut QCellOwner) -> Option<&'a mut Pre> {
        match owner.rw(&self.actor) {
            Inner::Pre(queue) => Some(queue),
            _ => None,
        }
    }

    fn is_pre(&self, owner: &QCellOwner) -> bool {
        matches!(owner.ro(&self.actor), Inner::Pre(_))
    }

    pub fn apply_pre(
        &self,
        runtime: &mut Runtime,
        f: impl FnOnce(&mut Context<'_, T>) -> Option<T> + 'static,
    ) {
        if self.is_pre(&runtime.owner) {
            let mut context = Context {
                core: &mut runtime.core,
                actor: self,
            };
            let Some(value) = f(&mut context) else {
                return;
            };

            let inner = runtime.owner.rw(&self.actor);
            match std::mem::replace(inner, Inner::Ready(value)) {
                Inner::Pre(Pre(mut queue)) => runtime.core.queue.borrow_mut().append(&mut queue),
                _ => panic!("Actor already ready"),
            }
        }
    }

    pub fn apply(
        &self,
        runtime: &mut Runtime,
        f: impl FnOnce(&mut T, &mut Context<'_, T>) + 'static,
    ) {
        if let Some(value) = self.borrow_ready(&mut runtime.owner) {
            let mut context = Context {
                core: &mut runtime.core,
                actor: self,
            };
            f(value, &mut context);
        } else if let Some(Pre(queue)) = self.borrow_pre(&mut runtime.owner) {
            let actor = self.clone();
            queue.push_back(Box::new(move |r| actor.apply(r, f)));
        }
    }

    pub fn defer(&self, f: impl FnOnce(&mut Runtime) + 'static) {
        self.queue.borrow_mut().push_back(Box::new(f));
    }

    pub fn timer(&self, time: u32, f: impl FnOnce(&mut Runtime) + 'static) {
        self.timers.borrow_mut().push(Timer(time, Box::new(f)));
    }
}

#[macro_export]
macro_rules! call {
    // Closure syntax
    ([$actor_or_context:expr], |$this:pat_param, $cxid:pat_param| $body:expr) => {{
        let actor = $actor_or_context.actor();
        $actor_or_context
            .defer(move |runtime| actor.apply(runtime, |$this, $cxid| $body))
    }};
    // Method syntax
    ([$actor_or_context:expr], $method:ident ( $($x:expr),* $(,)? )) => {{
        let actor = $actor_or_context.actor();
        $actor_or_context
            .defer(move |runtime| actor.apply(runtime, move |this, context| this.$method(context $(, $x)*)))
    }};
    // Static method syntax for pre methods
    ([$actor_or_context:expr], <$type:ident> :: $method:ident ( $($x:expr),* $(,)? )) => {{
        let actor = $actor_or_context.actor();
        $actor_or_context
            .defer(move |runtime| actor.apply_pre(runtime, move |context| $type::$method(context $(, $x)*)))
    }};
}

#[macro_export]
macro_rules! timer {
    // Closure syntax
    ([$actor_or_context:expr], $time:expr, |$this:pat_param, $cxid:pat_param| $body:expr) => {{
        let actor = $actor_or_context.actor();
        $actor_or_context
            .timer($time, move |runtime| actor.apply(runtime, |$this, $cxid| $body))
    }};
    // Method syntax
    ([$actor_or_context:expr], $time:expr, $method:ident ( $($x:expr),* $(,)? )) => {{
        let actor = $actor_or_context.actor();
        $actor_or_context
            .timer($time, move |runtime| actor.apply(runtime, |this, context| this.$method(context $(, $x)*)))
    }};
    // Static method syntax for pre methods
    ([$actor_or_context:expr], $time:expr, $type:ident :: $method:ident ( $($x:expr),* $(,)? )) => {{
        let actor = $actor_or_context.actor();
        $actor_or_context
            .timer($time, move |runtime| actor.apply_pre(runtime, move |context| $type::$method(context $(, $x)*)))
    }};
}

#[macro_export]
macro_rules! actor {
    ($core:expr, $type:ident :: $init:ident($($x:expr),* $(,)? )) => {{
        let actor = $core.new_actor();
        $crate::call!([actor], <$type>::$init($($x),*));
        actor
    }};
}
