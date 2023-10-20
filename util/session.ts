export function getPropertyDescriptorForReqSession(session: any) {
  return {
    enumerable: true,
    get() {
      return session;
    },
    set(value: any) {
      const keys = Object.keys(value);
      const currentKeys = Object.keys(session);
      currentKeys.forEach((key) => {
        if (!keys.includes(key)) {
          delete session[key];
        }
      });
      keys.forEach((key) => {
        session[key] = value[key];
      });
    },
  };
}
