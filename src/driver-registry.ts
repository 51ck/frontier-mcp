import type { StorageDriver } from './storage/driver.ts';

/**
 * One driver per workspace directory. A call carrying an explicit `root` reads a
 * different workspace from the session's own, and each keeps its own driver —
 * and so its own cache, its own watcher, and its own write queue.
 *
 * A driver is keyed on, and built with, the directory `directoryOf` finds a
 * spelling names, so a symlink or another case reaches the driver the
 * directory already has rather than a second cache and a second write queue.
 * Built with the directory, not the first spelling: a link repointed later
 * would otherwise carry the driver to a directory it is not keyed on.
 *
 * This is a lookup, not a layer: it hands back the driver itself, and no read
 * or write passes through it.
 */
export interface DriverRegistry {
  forWorkspace(root: string): StorageDriver;
  closeAll(): void;
}

export function createDriverRegistry(
  createDriver: (directory: string) => StorageDriver,
  directoryOf: (root: string) => string,
): DriverRegistry {
  const drivers = new Map<string, StorageDriver>();

  return {
    forWorkspace(root) {
      const directory = directoryOf(root);
      let driver = drivers.get(directory);
      if (driver === undefined) {
        driver = createDriver(directory);
        drivers.set(directory, driver);
      }
      return driver;
    },
    closeAll() {
      for (const driver of drivers.values()) driver.close();
      drivers.clear();
    },
  };
}
