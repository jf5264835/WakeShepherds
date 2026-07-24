type NavigationUser = {
  canViewAll?: boolean;
  canManageUsers?: boolean;
  canAccessYouth?: boolean;
  canManageYouth?: boolean;
  canAccessHospital?: boolean;
  canManageHospital?: boolean;
  canAccessDiscipleship?: boolean;
  canManageDiscipleship?: boolean;
  allowedCategories?: string[];
};

type NavItem = {
  label: string;
  description: string;
  href?: string;
  comingSoon?: boolean;
};

function NavGroup({ label, kicker, items }: { label: string; kicker: string; items: NavItem[] }) {
  return (
    <details className="dashboard-nav-group" name="dashboard-navigation">
      <summary>
        <span><small>{kicker}</small>{label}</span>
        <b aria-hidden="true">⌄</b>
      </summary>
      <div className="dashboard-nav-menu">
        {items.map((item) => item.href ? (
          <a href={item.href} key={item.label}>
            <span>{item.label}</span>
            <small>{item.description}</small>
          </a>
        ) : (
          <span className="dashboard-nav-future" key={item.label}>
            <span>{item.label}<em>{item.comingSoon ? "Coming soon" : ""}</em></span>
            <small>{item.description}</small>
          </span>
        ))}
      </div>
    </details>
  );
}

export default function DashboardNavigation({ user, globalAdmin = false }: { user?: NavigationUser | null; globalAdmin?: boolean }) {
  const isGlobal = globalAdmin || Boolean(user?.canManageUsers || user?.canViewAll);
  const categories = new Set(user?.allowedCategories ?? []);
  const canSeeYouth = isGlobal || Boolean(user?.canAccessYouth || user?.canManageYouth);
  const canSeeHospital = isGlobal || Boolean(user?.canAccessHospital || user?.canManageHospital);
  const canSeePregnancy = isGlobal || categories.has("Pregnancy");
  const canSeeDiscipleship = isGlobal || Boolean(user?.canAccessDiscipleship || user?.canManageDiscipleship);
  const canSeeGeneralCare = isGlobal || categories.size > 0;

  return (
    <nav className="dashboard-navigation" aria-label="Ministry dashboards">
      <a className="dashboard-nav-home" href="/my">
        <span>My assignments</span>
        <small>Private volunteer view</small>
      </a>

      {canSeeYouth && (
        <NavGroup
          label="NextGen"
          kicker="Next generation"
          items={[
            { label: "Wake Kids", description: "Children’s ministry care", comingSoon: true },
            { label: "Wake 56", description: "Fifth and sixth grade ministry", comingSoon: true },
            { label: "Wake Youth", description: "Students and youth staff care", href: "/youth" },
            { label: "Wake YA", description: "Young adult ministry", comingSoon: true },
          ]}
        />
      )}

      {(canSeeGeneralCare || canSeeHospital || canSeePregnancy) && (
        <NavGroup
          label="Care"
          kicker="Shepherding"
          items={[
            ...(canSeeGeneralCare ? [{ label: "Care Overview", description: "All permitted shepherding care", href: "/" }] : []),
            ...(canSeeHospital ? [{ label: "Hospital", description: "Visits, follow-up, and team resources", href: "/hospital" }] : []),
            ...(canSeePregnancy ? [{ label: "Pregnancy", description: "Pregnancy, postpartum, and fertility care", href: "/moms" }] : []),
            ...(isGlobal || categories.has("Grief") ? [{ label: "Grief", description: "Grief care assignments", href: "/?category=Grief" }] : []),
            ...(isGlobal || categories.has("Pre-marital counseling") ? [{ label: "Pre-marital Counseling", description: "Pre-marital care assignments", href: "/?category=Pre-marital%20counseling" }] : []),
            ...(isGlobal || categories.has("Marital counseling") ? [{ label: "Marital Counseling", description: "Marriage care assignments", href: "/?category=Marital%20counseling" }] : []),
          ]}
        />
      )}

      {(canSeeDiscipleship || isGlobal) && (
        <NavGroup
          label="Spiritual Formation"
          kicker="Formation"
          items={[
            ...(canSeeDiscipleship ? [{ label: "Discipleship", description: "Wake Men and Wake Women", href: "/discipleship" }] : []),
            { label: "Re|engage", description: "Marriage enrichment and care", comingSoon: true },
            { label: "Regeneration", description: "Recovery and discipleship care", comingSoon: true },
          ]}
        />
      )}

      {isGlobal && (
        <NavGroup
          label="Global"
          kicker="Administration"
          items={[
            { label: "Global Admin", description: "Accounts, permissions, integrations, and audit", href: "/admin" },
            { label: "Planning Center", description: "People lookup and workflows", href: "/planning-center" },
          ]}
        />
      )}
    </nav>
  );
}
