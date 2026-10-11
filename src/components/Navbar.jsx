import { useEffect, useRef, useState } from "react";
import {
  Link,
  NavLink,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { useApp } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import logo from "../assets/logo.png";
import ThemeToggle from "./ThemeToggle";
import { CITIES, requestCity, setLocationPref } from "../lib/location";
import {
  HomeIcon,
  CompassIcon,
  ChatIcon,
  UserIcon,
  PlusIcon,
  MapPinIcon,
  ChevronDownIcon,
  BellIcon,
  NavigationIcon,
  SearchIcon,
} from "./NavIcons";

/* Each nav item is its own icon tab, sized like the theme toggle beside it. */
const tabBase =
  "group relative h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60";

const tabClass = ({ isActive }) =>
  `${tabBase} ${
    isActive
      ? "border-mint/40 bg-mint/10 text-mint glow-mint"
      : "border-border bg-surface text-muted hover:bg-surface-3 hover:text-text"
  }`;

/* Plain text nav link (Home, Explore). */
const textLinkClass = ({ isActive }) =>
  `hidden shrink-0 rounded-md px-1.5 py-1 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60 md:inline-flex ${
    isActive
      ? "text-mint underline decoration-mint decoration-2 underline-offset-8"
      : "text-muted hover:text-text"
  }`;

/* Small label beside an icon button on hover or keyboard focus. */
function TabTooltip({ children, left = false }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute z-50 ${left ? "right-full top-1/2 mr-3 -translate-y-1/2" : "left-1/2 top-full mt-2 -translate-x-1/2"} whitespace-nowrap rounded-md border border-border bg-surface-2 px-2 py-1 text-xs font-medium text-text opacity-0 shadow-md transition-opacity delay-150 duration-150 group-hover:opacity-100 group-focus-visible:opacity-100`}
    >
      {children}
    </span>
  );
}

/* One tab of the mobile bottom bar: icon over label, mint when active. */
function MobileNavItem({ to, icon: Icon, label, primary = false }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `group relative flex min-w-0 flex-col items-center justify-center gap-1 text-[11px] leading-none transition-colors focus-visible:outline-none ${
          isActive
            ? "font-bold text-mint"
            : `font-semibold ${primary ? "text-text" : "text-muted hover:text-text"}`
        }`
      }
    >
      {({ isActive }) => (
        <>
          {!primary && (
            <span
              aria-hidden
              className={`absolute top-0 h-0.5 w-8 rounded-full bg-mint transition-opacity duration-200 ${
                isActive ? "opacity-100" : "opacity-0"
              }`}
            />
          )}
          <span
            aria-hidden
            className={`flex items-center justify-center rounded-full transition-colors group-focus-visible:ring-2 group-focus-visible:ring-mint/60 ${
              primary ? "h-9 w-9 bg-mint text-bg" : "h-9 w-11"
            }`}
          >
            <Icon className={primary ? "h-5 w-5 stroke-[2.5]" : "h-[22px] w-[22px]"} />
          </span>
          <span className="max-w-full truncate">{label}</span>
        </>
      )}
    </NavLink>
  );
}

/* Meetup-style search + city field. Search hands off to Explore via ?q=. */
function NavSearch() {
  const { city, setCity } = useApp();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const urlQuery = pathname === "/explore" ? (searchParams.get("q") ?? "") : "";

  const [text, setText] = useState(urlQuery);
  const [syncedQuery, setSyncedQuery] = useState(urlQuery);
  if (urlQuery !== syncedQuery) {
    setSyncedQuery(urlQuery);
    setText(urlQuery);
  }

  const [cityOpen, setCityOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState("");

  async function useMyLocation() {
    setLocating(true);
    setLocationNote("");
    const result = await requestCity();
    setLocating(false);

    if (result.ok && result.city) {
      setLocationPref("granted");
      setCity(result.city);
      setCityOpen(false);
    } else if (result.ok) {
      setLocationPref("granted");
      setLocationNote("Spontii isn't in your area yet. Pick a city below.");
    } else if (result.reason === "denied") {
      setLocationPref("denied");
      setLocationNote(
        "Location is blocked in your browser. Pick a city below.",
      );
    } else {
      setLocationNote("Couldn't get your location. Pick a city below.");
    }
  }

  // Close the city menu on outside click / Escape (touch has no mouseleave).
  const cityRef = useRef(null);
  useEffect(() => {
    if (!cityOpen) return;
    function onPointer(event) {
      if (!cityRef.current?.contains(event.target)) setCityOpen(false);
    }
    function onKey(event) {
      if (event.key === "Escape") setCityOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [cityOpen]);

  function submitSearch(event) {
    event.preventDefault();
    // Keep any Explore filters already in the URL; only q changes.
    const params = new URLSearchParams(
      pathname === "/explore" ? searchParams : undefined,
    );
    const q = text.trim();
    if (q) params.set("q", q);
    else params.delete("q");
    const qs = params.toString();
    navigate(qs ? `/explore?${qs}` : "/explore");
  }

  return (
    <div className="order-last flex h-11 w-full min-w-0 items-center rounded-xl border border-border bg-surface-2 transition-colors hover:border-text/25 focus-within:border-mint/60 focus-within:ring-2 focus-within:ring-mint/15 lg:order-none lg:h-10 lg:w-[340px] lg:shrink xl:w-[400px]">
      <form
        role="search"
        onSubmit={submitSearch}
        className="flex h-full min-w-0 flex-1 items-center"
      >
        <SearchIcon className="pointer-events-none ml-3.5 h-4 w-4 shrink-0 text-muted" />
        <input
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Search activities, people, or places..."
          aria-label="Search activities, people, or places"
          enterKeyHint="search"
          className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-sm text-text outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
        />
      </form>

      <span aria-hidden className="h-5 w-px shrink-0 bg-border" />

      <div ref={cityRef} className="relative h-full shrink-0">
        <button
          type="button"
          onClick={() => setCityOpen((v) => !v)}
          aria-label={`City: ${city}`}
          aria-haspopup="menu"
          aria-expanded={cityOpen}
          className="group flex h-full items-center gap-1.5 rounded-r-xl pl-3 pr-3 text-sm font-semibold text-text transition-colors hover:bg-text/5 focus-visible:bg-text/5 focus-visible:outline-none"
        >
          <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
            <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-mint animate-radar opacity-75" />
            <MapPinIcon className="relative z-10 h-4 w-4 text-mint" />
          </span>
          <span className="tracking-wide">{city}</span>
          <ChevronDownIcon
            className={`h-3.5 w-3.5 text-muted transition-transform ${cityOpen ? "rotate-180" : "group-hover:translate-y-0.5"}`}
          />
        </button>
        {cityOpen && (
          <div
            role="menu"
            className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-border bg-surface-2 shadow-xl"
          >
                <button
                  type="button"
                  onClick={useMyLocation}
                  disabled={locating}
                  className="flex w-full items-center gap-2 border-b border-border px-4 py-2.5 text-left text-sm font-semibold text-mint hover:bg-text/5 disabled:cursor-wait disabled:opacity-70"
                >
                  <NavigationIcon className="h-4 w-4 shrink-0" />
                  {locating ? "Locating…" : "Use my current location"}
                </button>
                {locationNote && (
                  <p
                    role="status"
                    className="border-b border-border px-4 py-2 text-xs leading-snug text-muted"
                  >
                    {locationNote}
                  </p>
                )}
                {CITIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      setCity(c);
                      setCityOpen(false);
                    }}
                    className={`block w-full px-4 py-2 text-left text-sm hover:bg-text/5 ${
                      c === city ? "text-mint font-semibold" : "text-text"
                    }`}
                  >
                    {c}
                  </button>
                ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Navbar() {
  const {
    currentUser,
    updates,
    notifOpen,
    setNotifOpen,
    hasUnreadNotifs,
    setHasUnreadNotifs,
  } = useApp();
  const { isAuthenticated } = useAuth();
  const { pathname } = useLocation();

  return (
    <>
    <header className="sticky top-0 z-40 border-b border-border/60 bg-bg/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3 sm:px-6 lg:flex-nowrap lg:py-4">
        {/* ================= LEFT SIDE: LOGO ================= */}
        <NavLink to="/" className="flex items-center shrink-0">
          <img
            src={logo}
            alt="spontii"
            className="h-14 w-auto object-contain"
          />
        </NavLink>

        {/* Search + city: inline on desktop, own row below on tablet/mobile */}
        <NavSearch />

        {/* Text links; Explore's md:mr-auto pushes the remaining controls right */}
        <NavLink to="/" end className={textLinkClass}>
          Home
        </NavLink>

        <NavLink
          to="/explore"
          className={(state) => `${textLinkClass(state)} md:mr-auto`}
        >
          Explore
        </NavLink>

        {/* ================= RIGHT SIDE: INBOX + UTILITIES + CREATE ================= */}
        <div className="flex items-center gap-2 shrink-0 sm:gap-3">
          <NavLink
            to="/inbox"
            className={({ isActive }) => `hidden md:flex ${tabClass({ isActive })}`}
            aria-label="Inbox"
          >
            <ChatIcon className="h-4 w-4" />
            <TabTooltip>Inbox</TabTooltip>
          </NavLink>

          <ThemeToggle />

          {isAuthenticated ? (
            <div className="flex items-center gap-2 shrink-0 sm:gap-3">
              <div className="relative">
                <button
                  onClick={() => {
                    setNotifOpen((v) => !v);
                    setHasUnreadNotifs(false);
                  }}
                  className="relative flex h-9 w-9 items-center justify-center rounded-full bg-surface text-muted transition-colors hover:bg-surface-3 hover:text-text"
                  aria-label="Notifications"
                >
                  <BellIcon className="h-[18px] w-[18px]" />
                  {hasUnreadNotifs && (
                    <span className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-surface bg-mint" />
                  )}
                </button>
                {notifOpen && (
                  <div
                    className="absolute right-0 mt-2 w-72 overflow-hidden rounded-xl border border-border bg-surface-2 p-2 shadow-xl z-50"
                    onMouseLeave={() => setNotifOpen(false)}
                  >
                    {updates.length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted">
                        You're all caught up.
                      </div>
                    )}
                    {updates.map((u) => (
                      <div
                        key={u.id}
                        className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-text/5"
                      >
                        {u.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <NavLink to="/profile">
                <img
                  src={currentUser.avatar}
                  alt={currentUser.name}
                  className="h-9 w-9 rounded-full border border-border object-cover transition-transform hover:scale-105"
                />
              </NavLink>
            </div>
          ) : (
            <nav
              aria-label="Account"
              className="flex shrink-0 items-center gap-1 sm:gap-2"
            >
              <Link
                to="/login"
                className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold text-text transition-colors hover:bg-text/5 sm:h-10 sm:px-4"
              >
                Log in
              </Link>
              <Link
                to="/signup"
                className="inline-flex h-9 items-center rounded-lg bg-mint px-3.5 text-sm font-bold text-bg transition-[background-color,transform] duration-150 hover:bg-mint/90 active:scale-95 sm:h-10 sm:px-5"
              >
                Sign up
              </Link>
            </nav>
          )}
        </div>
      </div>

    </header>

    {/* Mobile bottom bar. Outside <header> so `fixed` is relative to the
        viewport; safe-area padding keeps it above the system home bar. */}
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="mx-auto grid h-16 max-w-md grid-cols-5 px-1">
        <MobileNavItem to="/" icon={HomeIcon} label="Home" />
        <MobileNavItem to="/explore" icon={CompassIcon} label="Explore" />
        <MobileNavItem to="/create" icon={PlusIcon} label="Create" primary />
        <MobileNavItem to="/inbox" icon={ChatIcon} label="Inbox" />
        <MobileNavItem to="/profile" icon={UserIcon} label="Profile" />
      </div>
    </nav>

    {/* Floating Create Plan button (tablet/desktop; phones use the bottom bar).
        Rendered outside <header>: its backdrop-blur would otherwise make `fixed`
        relative to the header. /create handles the login redirect. */}
    {pathname !== "/create" && (
      <NavLink
        to="/create"
        aria-label="Create Plan"
        className="group fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-40 hidden h-14 w-14 items-center justify-center rounded-full border border-mint bg-mint text-bg shadow-lg shadow-mint/30 transition-[background-color,transform] duration-150 hover:scale-105 hover:bg-mint/90 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg sm:bottom-[calc(1.5rem+env(safe-area-inset-bottom))] sm:right-6 md:flex"
      >
        <PlusIcon className="h-6 w-6 stroke-[2.5]" />
        <TabTooltip left>Create Plan</TabTooltip>
      </NavLink>
    )}
    </>
  );
}
