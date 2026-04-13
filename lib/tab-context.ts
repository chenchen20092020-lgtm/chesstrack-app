import { createContext, useContext } from 'react';

type TabContextValue = {
  goToTab: (index: number) => void;
  activeTabIndex: number;
};

// Shared context so any screen can scroll the root pager to a specific tab,
// and subscribe to the active tab index to re-load data on focus.
export const TabContext = createContext<TabContextValue>({
  goToTab: () => {},
  activeTabIndex: 0,
});

export function useTabNavigation(): TabContextValue {
  return useContext(TabContext);
}
