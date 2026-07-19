export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function badRequest(message: string, code = "bad_request") {
  return new HttpError(400, message, code);
}

export function unauthorized(message = "未登录", code = "unauthorized") {
  return new HttpError(401, message, code);
}

export function forbidden(message = "无权限", code = "forbidden") {
  return new HttpError(403, message, code);
}

export function conflict(message: string, code = "conflict") {
  return new HttpError(409, message, code);
}

export function notFound(message = "未找到", code = "not_found") {
  return new HttpError(404, message, code);
}
