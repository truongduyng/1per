type DataChangeListener = () => void;

const listeners = new Set<DataChangeListener>();

export function subscribeToDataChanges(listener: DataChangeListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyDataChanged() {
  for (const listener of listeners) listener();
}
