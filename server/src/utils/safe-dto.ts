export function toSafeDTO<T extends object, K extends keyof T>(
  data: T,
  whitelist: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  whitelist.forEach((key) => {
    if (key in data) {
      result[key] = data[key];
    }
  });
  return result;
}

export function toSafeDTOList<T extends object, K extends keyof T>(
  data: T[],
  whitelist: K[]
): Pick<T, K>[] {
  return data.map((item) => toSafeDTO(item, whitelist));
}
