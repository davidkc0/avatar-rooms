export const generateRandomHexColor = (): string => {
  return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
};

export const getRandomExpression = (): string => {
  const expressions = ['happy', 'lol'];
  return expressions[Math.floor(Math.random() * expressions.length)];
};

export const setStoreValue = (key: string, value: string): void => {
  window.localStorage.setItem(key, value);
};

export const getStoreValue = (key: string): string | null => {
  return window.localStorage.getItem(key);
};

