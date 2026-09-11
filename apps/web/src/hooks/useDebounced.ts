import { useEffect, useState } from "react";

export function useDebounced(value: string) {
  const [result, setResult] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setResult(value), 250);
    return () => clearTimeout(id);
  }, [value]);
  return result;
}
