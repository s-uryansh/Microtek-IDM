export function authError(code, message, status) {
  return Object.assign(new Error(message), { code, status });
}

export const invalidCredentialsError = () => authError("INVALID_CREDENTIALS", "Invalid username or password", 401);
