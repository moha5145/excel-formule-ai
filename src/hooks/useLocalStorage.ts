import { useState, useEffect } from "react";

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(initialValue);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => {
      try {
        const item = window.localStorage.getItem(key);
        if (item) {
          setStoredValue(JSON.parse(item) as T);
        }
      } catch (error) {
        console.error(error);
      }
      setHydrated(true);
    }, 0);
    return () => clearTimeout(id);
  }, [key]);

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      setStoredValue((prev) => {
        const valueToStore = value instanceof Function ? value(prev) : value;
        if (typeof window !== "undefined") {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
        }
        return valueToStore;
      });
    } catch (error) {
      console.error(error);
    }
  };

  return [hydrated ? storedValue : initialValue, setValue] as const;
}
