/* eslint-disable no-restricted-globals */
export const getContainerId = (): { containerId: string; isNew: boolean } => {
    let isNew = false;
    if (location.hash.length === 0) {
      isNew = true;
      location.hash = Date.now().toString();
    }
    const containerId = location.hash.substring(1);
    return { containerId, isNew };
  };
