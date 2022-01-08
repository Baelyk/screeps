export class Log {
  static colorError = "#cc241d";
  static colorWarn = "#fe8019";
  static colorInfo = "#458588";
  static colorLog = "#ebdbb2";
  static colorTickFg = "#282828";
  static colorTickBg = "#d79921";
  static symbolError = "";
  static symbolWarn = "";
  static symbolInfo = "";

  /**
   * Return the name of the error code, i.e. it's constant name
   *
   * @param error The error code
   * @returns The constant name of the error code, or an empty string if the
   *   error code does not exist
   */
  public static errorConstant(error: ScreepsReturnCode): string {
    switch (error) {
      case OK:
        return "OK";
      case ERR_NOT_OWNER:
        return "ERR_NOT_OWNER";
      case ERR_NO_PATH:
        return "ERR_NO_PATH";
      case ERR_NAME_EXISTS:
        return "ERR_NAME_EXISTS";
      case ERR_BUSY:
        return "ERR_BUSY";
      case ERR_NOT_FOUND:
        return "ERR_NOT_FOUND ";
      case ERR_NOT_ENOUGH_RESOURCES:
        return "ERR_NOT_ENOUGH_RESOURCES";
      case ERR_NOT_ENOUGH_ENERGY:
        return "ERR_NOT_ENOUGH_ENERGY";
      case ERR_INVALID_TARGET:
        return "ERR_INVALID_TARGET";
      case ERR_FULL:
        return "ERR_FULL";
      case ERR_NOT_IN_RANGE:
        return "ERR_NOT_IN_RANGE";
      case ERR_INVALID_ARGS:
        return "ERR_INVALID_ARGS";
      case ERR_TIRED:
        return "ERR_TIRED";
      case ERR_NO_BODYPART:
        return "ERR_NO_BODYPART";
      case ERR_NOT_ENOUGH_EXTENSIONS:
        return "ERR_NOT_ENOUGH_EXTENSIONS";
      case ERR_RCL_NOT_ENOUGH:
        return "ERR_RCL_NOT_ENOUGH";
      case ERR_GCL_NOT_ENOUGH:
        return "ERR_GCL_NOT_ENOUGH";
      default:
        return "";
    }
  }

  /** Uses html span to add color to a log message. */
  private static color(color: string, msg?: string): string {
    return `<span style="color: ${color}">${msg}</span>`;
  }

  /** Take any type and turn it into a string */
  private static msgToString(msg?: any): string {
    if (msg == undefined) {
      return "";
    } else if (typeof msg === "string") {
      return msg;
    } else {
      return JSON.stringify(msg);
    }
  }

  private static log(msg: string, color = Log.colorLog): void {
    console.log(Log.color(color, `[${Game.time}] ${msg}`));
  }

  public static error(msg?: any): void {
    msg = Log.msgToString(msg);
    msg = `${Log.symbolError} ${msg}`;
    Log.log(msg, Log.colorError);
  }

  public static warn(msg?: any): void {
    msg = Log.msgToString(msg);
    msg = `${Log.symbolWarn} ${msg}`;
    Log.log(msg, Log.colorWarn);
  }

  public static info(msg?: any): void {
    msg = Log.msgToString(msg);
    msg = `${Log.symbolInfo} ${msg}`;
    Log.log(msg, Log.colorInfo);
  }

  public static tick(): void {
    const format = `font-weight: bold; color: ${Log.colorTickFg}; background: ${Log.colorTickBg}`;
    console.log(`<span style="${format}">[${Game.time}]</span>`);
  }
}
