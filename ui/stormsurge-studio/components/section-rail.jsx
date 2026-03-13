export function SectionRail({
  sections,
  requirements,
  activeSectionId,
  onAddSection,
  onSelectSection,
}) {
  return (
    <aside className="panel rail-panel">
      <div className="panel-head">
        <div className="eyebrow">Sections</div>
        <h2>Work lanes</h2>
      </div>

      <div className="rail-actions">
        <button type="button" className="ghost-button" onClick={onAddSection}>
          Add section tab
        </button>
      </div>

      <div className="section-list">
        {sections.map((section) => {
          const isActive = section.id === activeSectionId;
          const requirementCount = requirements.filter(
            (requirement) => requirement.sectionId === section.id,
          ).length;

          return (
            <button
              key={section.id}
              type="button"
              className={`section-button${isActive ? " active" : ""}`}
              onClick={() => onSelectSection(section.id)}
            >
              <span>{section.label}</span>
              <small>
                {section.shortLabel} · {requirementCount}
              </small>
            </button>
          );
        })}
      </div>

      <div className="rail-note">
        Tabs are first-class section workspaces. The data model underneath stays
        object-based so requirements can eventually move, nest, and cross-link.
      </div>
    </aside>
  );
}
