import type { KeyboardEvent } from "react";

// =============================================================================
// Tab bar keyboard navigation helper (Wave 5 / a11y).
//
// Implements the WAI-ARIA tab pattern for arrow-key navigation:
//   - ArrowRight → activate + focus next tab (wraps to first)
//   - ArrowLeft  → activate + focus previous tab (wraps to last)
//   - Home       → activate + focus first tab
//   - End        → activate + focus last tab
//
// Uses "automatic activation" — the focused tab becomes active immediately.
// This is simpler than "manual activation" (focus + Enter to activate) and
// matches the pattern most users expect from desktop tab bars.
//
// USAGE (with a tablist container ref + roving tabIndex):
//
//   const tablistRef = useRef<HTMLDivElement>(null);
//   const tabs = ["overview", "documents", "history"];
//   const [activeTab, setActiveTab] = useState(tabs[0]);
//
//   <div ref={tablistRef} role="tablist" aria-label="...">
//     {tabs.map((t, i) => (
//       <button
//         key={t}
//         role="tab"
//         aria-selected={activeTab === t}
//         tabIndex={activeTab === t ? 0 : -1}
//         onClick={() => setActiveTab(t)}
//         onKeyDown={(e) => handleTabKeyDown(e, i, tabs.length, () => {
//           setActiveTab(tabs[...next index...]);
//           // focus is moved by the useEffect below
//         })}
//       >
//         {t}
//       </button>
//     ))}
//   </div>
//
//   // After activeTab changes, move focus to the new active tab:
//   useEffect(() => {
//     const active = tablistRef.current?.querySelector('[tabindex="0"]') as HTMLButtonElement | null;
//     active?.focus();
//   }, [activeTab]);
//
// WHY A SHARED HELPER (vs inline):
//   - Three tab bars use the same pattern (compliance, unions-detail, calendar).
//   - The switch statement + wrap math is easy to get wrong.
//   - Centralizing makes future changes (e.g. adding Ctrl+Arrow) one-edit.
//
// WHY NOT A SHARED COMPONENT:
//   - Each tab bar has different styling (different className per tab, different
//     active state styling). A shared component would either be too rigid or
//     need a render-prop API. The helper + inline JSX keeps the visual
//     flexibility while sharing the keyboard logic.
// =============================================================================

/**
 * Handle ArrowLeft/ArrowRight/Home/End on a tab button.
 *
 * @param e           The keyboard event from the tab button's onKeyDown.
 * @param currentIndex The index of the tab that has focus (in the tabs array).
 * @param totalTabs    The total number of tabs in the tablist.
 * @param onActivate   Callback that activates the tab at the computed index.
 *                     The caller is responsible for updating active-tab state
 *                     AND moving focus to the newly-active tab (typically via
 *                     a useEffect that runs when activeTab changes).
 *
 * The handler calls e.preventDefault() for the handled keys so the browser's
 * default arrow-key behavior (e.g. scrolling) doesn't interfere. For keys
 * the handler doesn't act on (Tab, Enter, Space, etc.), it does nothing —
 * the browser's default behavior applies.
 */
export function handleTabKeyDown(
  e: KeyboardEvent<HTMLButtonElement>,
  currentIndex: number,
  totalTabs: number,
  onActivate: (nextIndex: number) => void,
): void {
  let nextIndex: number | null = null;
  switch (e.key) {
    case "ArrowRight":
      nextIndex = (currentIndex + 1) % totalTabs;
      break;
    case "ArrowLeft":
      nextIndex = (currentIndex - 1 + totalTabs) % totalTabs;
      break;
    case "Home":
      nextIndex = 0;
      break;
    case "End":
      nextIndex = totalTabs - 1;
      break;
    default:
      return; // Don't preventDefault for unhandled keys.
  }
  e.preventDefault();
  if (nextIndex !== null && nextIndex !== currentIndex) {
    onActivate(nextIndex);
  }
}
