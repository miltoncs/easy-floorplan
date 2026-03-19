type InspectorTabId = 'properties' | 'measurements' | 'furniture' | 'preview-export'

const TABS: Array<{ id: InspectorTabId; label: string }> = [
  { id: 'properties', label: 'Properties' },
  { id: 'measurements', label: 'Measurements' },
  { id: 'furniture', label: 'Furniture' },
  { id: 'preview-export', label: 'Preview / Export' },
]

export function CockpitInspectorTabs({
  activeTab,
  onSelect,
}: {
  activeTab: InspectorTabId
  onSelect: (tab: InspectorTabId) => void
}) {
  return (
    <div aria-label="Inspector tabs" className="cockpit-inspector__tablist" role="tablist">
      {TABS.map((tab) => (
        <button
          aria-selected={activeTab === tab.id}
          className={activeTab === tab.id ? 'cockpit-inspector__tab active' : 'cockpit-inspector__tab'}
          key={tab.id}
          onClick={() => onSelect(tab.id)}
          role="tab"
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export type { InspectorTabId }
