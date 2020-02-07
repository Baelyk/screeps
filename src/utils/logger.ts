// Useful functions for producing user-readable output to the console

/**
 * Return the name of the error code, i.e. it's constant name
 *
 * @param  error the error code
 *
 * @return the constant name of the error code, or an empty string if the error code does not exist
 */
export function errorConstant (error: ResponseCode): string {
  switch (error) {
    case OK: return "OK"
    case ERR_NOT_OWNER: return "ERR_NOT_OWNER"
    case ERR_NO_PATH: return "ERR_NO_PATH"
    case ERR_NAME_EXISTS: return "ERR_NAME_EXISTS"
    case ERR_BUSY: return "ERR_BUSY"
    case ERR_NOT_FOUND : return "ERR_NOT_FOUND "
    case ERR_NOT_ENOUGH_RESOURCES: return "ERR_NOT_ENOUGH_RESOURCES"
    case ERR_NOT_ENOUGH_ENERGY: return "ERR_NOT_ENOUGH_ENERGY"
    case ERR_INVALID_TARGET: return "ERR_INVALID_TARGET"
    case ERR_FULL: return "ERR_FULL"
    case ERR_NOT_IN_RANGE: return "ERR_NOT_IN_RANGE"
    case ERR_INVALID_ARGS: return "ERR_INVALID_ARGS"
    case ERR_TIRED: return "ERR_TIRED"
    case ERR_NO_BODYPART: return "ERR_NO_BODYPART"
    case ERR_NOT_ENOUGH_EXTENSIONS: return "ERR_NOT_ENOUGH_EXTENSIONS"
    case ERR_RCL_NOT_ENOUGH: return "ERR_RCL_NOT_ENOUGH"
    case ERR_GCL_NOT_ENOUGH: return "ERR_GCL_NOT_ENOUGH"
    default: return ""
  }
}

/**
 * Logs a message in blue
 *
 * @param  msg the message
 */
export function info (msg?: any) {
  console.log(`{cyan-fg}Info: ${msg}{/cyan-fg}`)
}

/**
 * Logs a message in red
 *
 * @param  msg the message
 */
export function error (msg?: any) {
  console.log(`{red-fg}Error: ${msg}{/red-fg}`)
}

/**
 * Creates a string from a provided BodyPartConstant array
 *
 * @param  body the BodyPartConstant[]
 *
 * @return a string representing the body
 */
export function stringifyBody (body: BodyPartConstant[]): string {
  let string = ""
  body.forEach(part => {
    switch (part) {
      case WORK: string += "W"; break
      case CARRY: string += "C"; break
      case MOVE: string += "M"; break
      default: error(`stringifyBody unexpected body part ${part}`)
    }
  })
  return string
}