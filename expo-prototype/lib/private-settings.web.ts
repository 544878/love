export async function loadPrivate(key: string) {
  return sessionStorage.getItem(key);
}

export async function savePrivate(key: string, value: string | null) {
  if (value === null) sessionStorage.removeItem(key);
  else sessionStorage.setItem(key, value);
}
