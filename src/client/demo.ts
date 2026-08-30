export const DEMO_STORAGE_KEY = 'household-coordinator:synthetic-demo:v1';

export interface DemoState {
  household: string;
  pet: { name: string; species: string };
  chores: Array<{ id: string; title: string; due: string; completed: boolean }>;
  groceries: Array<{ id: string; name: string; quantity: string; checked: boolean }>;
  care: Array<{ id: string; kind: 'feeding' | 'walk'; label: string; completed: boolean }>;
}

export interface BrowserStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function seed(): DemoState {
  return {
    household: 'Sunbeam House (Demo)',
    pet: { name: 'Pixel', species: 'dog' },
    chores: [
      {
        id: 'demo-chore-1',
        title: 'Water the porch fern',
        due: 'Today, 6:00 PM',
        completed: false,
      },
      {
        id: 'demo-chore-2',
        title: 'Take recycling out',
        due: 'Tomorrow, 7:00 AM',
        completed: true,
      },
    ],
    groceries: [
      { id: 'demo-grocery-1', name: 'Oat milk', quantity: '2 cartons', checked: false },
      { id: 'demo-grocery-2', name: 'Brown rice', quantity: '1 bag', checked: true },
    ],
    care: [
      { id: 'demo-care-1', kind: 'feeding', label: 'Evening meal', completed: false },
      { id: 'demo-care-2', kind: 'walk', label: 'Short evening walk', completed: false },
    ],
  };
}

export function createDemoStore(storage: BrowserStorage) {
  let state: DemoState;
  try {
    const stored = storage.getItem(DEMO_STORAGE_KEY);
    state = stored ? (JSON.parse(stored) as DemoState) : seed();
  } catch {
    state = seed();
  }
  const save = () => storage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
  save();
  return {
    snapshot: (): DemoState => structuredClone(state),
    completeChore: (id: string): void => {
      state = {
        ...state,
        chores: state.chores.map((chore) =>
          chore.id === id ? { ...chore, completed: true } : chore,
        ),
      };
      save();
    },
    reset: (): void => {
      storage.removeItem(DEMO_STORAGE_KEY);
      state = seed();
      save();
    },
  };
}
