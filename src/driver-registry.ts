import type { StorageDriver } from './storage/driver.ts';

/**
 * One driver per resolved workspace. A call carrying an explicit `root` reads a
 * different workspace from the session's own, and each keeps its own driver —
 * and so its own cache, its own watcher, and its own write queue.
 *
 * This is a lookup, not a layer: it hands back the driver itself, and no read
 * or write passes through it.
 */
export interface DriverRegistry {
  forWorkspace(root: string): StorageDriver;
  closeAll(): void;
}

export function createDriverRegistry(
  createDriver: (root: string) => StorageDriver,
): DriverRegistry {
  const drivers = new Map<string, StorageDriver>();

  return {
    forWorkspace(root) {
      let driver = drivers.get(root);
      if (driver === undefined) {
        driver = createDriver(root);
        drivers.set(root, driver);
      }
      return driver;
    },
    closeAll() {
      for (const driver of drivers.values()) driver.close();
      drivers.clear();
    },
  };
}
