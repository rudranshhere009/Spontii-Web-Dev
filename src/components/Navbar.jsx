import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
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
import Notifications from "./Notifications";
import { FriendsMenu, PeopleSearch } from "./PeopleControls";
import {
  CITY_CENTERS,
  CITY_STATES,
  fetchCitiesForState,
  geocodeCity,
  getSelectedCity,
  getSelectedCityCenter,
  getSelectedState,
  INDIA_STATES,
  requestIndianLocation,
  saveSelectedCity,
  setLocationPref,
  STATE_CENTERS,
} from "../lib/location";
import {
  HomeIcon,
  CompassIcon,
  ChatIcon,
  UserIcon,
  PlusIcon,
  MapPinIcon,
  ChevronDownIcon,
  NavigationIcon,
  SearchIcon,
  UsersIcon,
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

function cityMarkerIcon(selected) {
  const pin = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10.2c0 5.1-8 10.3-8 10.3S4 15.3 4 10.2a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10.2" r="2.5"/></svg>'
  return L.divIcon({
    className: `spontii-map-marker${selected ? " is-selected" : ""}`,
    html: `<span>${pin}</span>`,
    iconSize: [32, 40],
    iconAnchor: [16, 38],
  })
}

function LocationSearchSelect({
  id,
  label,
  value,
  options,
  placeholder,
  disabled = false,
  loading = false,
  emptyMessage = "No matches found",
  onSelect,
  onInputChange,
}) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const inputRef = useRef(null);
  const visibleValue = editing ? query : value;
  const normalizedQuery = editing ? query.trim().toLocaleLowerCase() : "";
  const filteredOptions = options
    .filter((option) => option.toLocaleLowerCase().includes(normalizedQuery));

  useEffect(() => {
    if (!open || disabled || !inputRef.current) return undefined;

    const updatePosition = () => {
      const rect = inputRef.current?.getBoundingClientRect();
      if (rect) {
        setMenuPosition({
          top: rect.bottom + 8,
          left: rect.left,
          width: rect.width,
        });
      }
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, disabled]);

  function choose(option) {
    setQuery(option);
    setEditing(false);
    setOpen(false);
    onSelect(option);
  }

  return (
    <div className="location-combobox">
      <label htmlFor={id} className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted">
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-controls={`${id}-options`}
          aria-expanded={open}
          aria-label={label}
          autoComplete="off"
          value={visibleValue}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            setEditing(true);
            setOpen(true);
            onInputChange?.(nextQuery);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              setEditing(false);
            } else if (event.key === "Enter" && filteredOptions.length > 0) {
              event.preventDefault();
              choose(filteredOptions[0]);
            } else if (event.key === "ArrowDown") {
              setOpen(true);
            }
          }}
          onBlur={(event) => {
            if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) {
              setOpen(false);
              setEditing(false);
            }
          }}
          className="location-combobox-input h-11 w-full rounded-xl border border-border bg-surface px-3 pr-12 text-sm text-text outline-none transition duration-200 placeholder:text-muted-2 hover:border-text/25 focus:border-mint/60 focus:ring-2 focus:ring-mint/15 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <ChevronDownIcon
          aria-hidden
          className={`pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
        {open && !disabled && menuPosition && createPortal(
          <div
            className="location-combobox-menu fixed z-[1000] overflow-hidden rounded-xl border border-border bg-surface-2 p-1.5"
            style={menuPosition}
          >
            {filteredOptions.length > 0 ? (
              <ul id={`${id}-options`} role="listbox" className="location-combobox-options">
                {filteredOptions.map((option) => (
                  <li key={option} role="option" aria-selected={option === value}>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => choose(option)}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-mint/10 hover:text-mint ${option === value ? "bg-mint/10 text-mint" : "text-text"}`}
                    >
                      <span>{option}</span>
                      {option === value && <span aria-hidden className="text-xs">Selected</span>}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-3 py-3 text-sm text-muted">
                {loading ? "Loading options…" : emptyMessage}
              </p>
            )}
            {loading && filteredOptions.length > 0 && (
              <p className="border-t border-border px-3 py-2 text-xs text-muted">Refreshing city list…</p>
            )}
          </div>,
          document.body,
        )}
      </div>
    </div>
  )
}

/* Meetup-style search + city field. Search hands off to Explore via ?q=. */
function NavSearch() {
  const { setCity } = useApp();
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

  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [selectedCity, setSelectedCity] = useState(getSelectedCity);
  const [draftCity, setDraftCity] = useState("");
  const [draftCoordinates, setDraftCoordinates] = useState(getSelectedCityCenter);
  const [selectedState, setSelectedState] = useState(
    () => getSelectedState() || CITY_STATES[getSelectedCity()] || "",
  );
  const [cityOptions, setCityOptions] = useState([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [citiesError, setCitiesError] = useState("");
  const [citiesRetry, setCitiesRetry] = useState(0);
  const [cityResolving, setCityResolving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState("");
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const cityMarkerRef = useRef(null);
  const locationDraftRef = useRef({ city: draftCity, state: selectedState, coordinates: draftCoordinates });
  const cityRequestRef = useRef(0);

  useEffect(() => {
    locationDraftRef.current = {
      city: draftCity,
      state: selectedState,
      coordinates: draftCoordinates,
    };
  }, [draftCity, selectedState, draftCoordinates]);

  useEffect(() => {
    if (!cityPickerOpen || !selectedState) return undefined;

    const controller = new AbortController();
    fetchCitiesForState(selectedState, controller.signal)
      .then((cities) => {
        if (!controller.signal.aborted) setCityOptions(cities);
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setCityOptions([]);
          setCitiesError(error.message || `Couldn't load cities for ${selectedState}.`);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCitiesLoading(false);
      });

    return () => controller.abort();
  }, [cityPickerOpen, selectedState, citiesRetry]);

  async function useMyLocation() {
    setLocating(true);
    setLocationNote("");
    try {
      const location = await requestIndianLocation();
      cityRequestRef.current += 1;
      setSelectedState(location.state);
      setDraftCity(location.city);
      setDraftCoordinates(location.coordinates);
      setCityOptions([]);
      setCitiesError("");
      setCitiesLoading(true);
      setLocationNote(`Location found: ${location.city}, ${location.state}.`);
      setLocationPref("granted");
    } catch (error) {
      setLocationNote(error.message || "Couldn't get your location. Try again.");
    } finally {
      setLocating(false);
    }
  }

  function clearDraftCity() {
    cityRequestRef.current += 1;
    setDraftCity("");
    setDraftCoordinates(null);
    setCityResolving(false);
    setLocationNote("");
  }

  async function chooseCity(city) {
    clearDraftCity();
    if (!city || !selectedState) return;

    const requestId = cityRequestRef.current;
    const controller = new AbortController();
    setDraftCity(city);
    setCityResolving(true);
    setLocationNote(`Finding ${city} on the map…`);
    try {
      const coordinates = await geocodeCity(city, selectedState, controller.signal);
      if (requestId !== cityRequestRef.current) return;
      setDraftCity(city);
      setDraftCoordinates(coordinates);
      setLocationNote("");
    } catch (error) {
      if (error.name !== "AbortError" && requestId === cityRequestRef.current) {
        setLocationNote(error.message || `Couldn't locate ${city}. Please choose another city.`);
      }
    } finally {
      if (requestId === cityRequestRef.current) setCityResolving(false);
    }
  }

  function chooseState(state) {
    cityRequestRef.current += 1;
    setSelectedState(state);
    setCityOptions([]);
    setCitiesError("");
    setCitiesLoading(Boolean(state));
    setDraftCity("");
    setDraftCoordinates(null);
    setCityResolving(false);
    setLocationNote("");
  }

  function closeCityPicker() {
    setCityPickerOpen(false);
    setCitiesLoading(false);
  }

  useEffect(() => {
    if (!cityPickerOpen || !mapContainerRef.current) return undefined;

    const map = L.map(mapContainerRef.current, {
      scrollWheelZoom: true,
      zoomControl: true,
    }).setView([22.5, 78.5], 4.5);
    mapRef.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    const { city, state, coordinates } = locationDraftRef.current;
    if (coordinates && city) {
      map.flyTo(coordinates, 11, { duration: 0.7 });
      cityMarkerRef.current = L.marker(coordinates, {
        icon: cityMarkerIcon(true),
      }).addTo(map).bindTooltip(city);
    } else if (state && STATE_CENTERS[state]) {
      map.flyTo(STATE_CENTERS[state], 6.5, { duration: 0.7 });
    }

    return () => {
      map.stop();
      map.remove();
      mapRef.current = null;
      cityMarkerRef.current = null;
    };
  }, [cityPickerOpen]);

  useEffect(() => {
    const map = mapRef.current;
    if (!cityPickerOpen || !map) return;

    if (draftCity && draftCoordinates) {
      map.flyTo(draftCoordinates, 11, { duration: 0.8 });
      if (cityMarkerRef.current) {
        cityMarkerRef.current.setLatLng(draftCoordinates).setTooltipContent(draftCity);
      } else {
        cityMarkerRef.current = L.marker(draftCoordinates, {
          icon: cityMarkerIcon(true),
        }).addTo(map).bindTooltip(draftCity);
      }
    } else {
      if (cityMarkerRef.current) {
        map.removeLayer(cityMarkerRef.current);
        cityMarkerRef.current = null;
      }
      if (selectedState && STATE_CENTERS[selectedState]) {
        map.flyTo(STATE_CENTERS[selectedState], 6.5, { duration: 0.8 });
      } else {
        map.flyTo([22.5, 78.5], 4.5, { duration: 0.8 });
      }
    }
  }, [cityPickerOpen, draftCity, draftCoordinates, selectedState])

  useEffect(() => {
    if (!cityPickerOpen) return undefined

    function onKey(event) {
      if (event.key === "Escape") closeCityPicker();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [cityPickerOpen]);

  function applyCity() {
    if (!draftCity || !selectedState || !draftCoordinates) return
    setSelectedCity(draftCity)
    setCity(draftCity)
    saveSelectedCity(draftCity, selectedState, draftCoordinates)
    setLocationPref("selected")
    window.dispatchEvent(new Event("spontii:location-changed"))
    closeCityPicker()
  }

  function openCityPicker() {
    setCityPickerOpen(true)
    const savedCity = getSelectedCity()
    const savedState = getSelectedState() || CITY_STATES[savedCity] || ""
    setDraftCity(savedCity)
    setSelectedState(savedState)
    setDraftCoordinates(getSelectedCityCenter() || CITY_CENTERS[savedCity] || null)
    setCityOptions([])
    setCitiesError("")
    setCitiesLoading(Boolean(savedState))
    setLocationNote("")
  }

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
    <>
    <div className="nav-search order-last flex h-11 w-full min-w-0 items-center rounded-xl border border-border bg-surface-2 transition-[border-color,box-shadow,width,background-color] duration-300 ease-out hover:border-text/25 focus-within:border-mint/60 focus-within:bg-surface-3 focus-within:ring-2 focus-within:ring-mint/15 lg:order-none lg:h-10 lg:w-[370px] lg:shrink-0 lg:focus-within:w-[450px] xl:w-[440px] xl:focus-within:w-[520px]">
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

      <div className="relative h-full shrink-0">
        <button
          type="button"
          onClick={openCityPicker}
          aria-label={`Location: ${selectedCity || "Your location"}`}
          aria-haspopup="dialog"
          aria-expanded={cityPickerOpen}
          className={`group flex h-full items-center gap-1.5 rounded-r-xl pl-3 pr-3 text-sm font-semibold transition-colors hover:bg-text/5 focus-visible:bg-text/5 focus-visible:outline-none ${selectedCity ? "text-text" : "text-muted"}`}
        >
          <MapPinIcon className="h-4 w-4 shrink-0 text-muted" />
          <span className="tracking-wide">{selectedCity || "Your location"}</span>
          <ChevronDownIcon
            className={`h-3.5 w-3.5 text-muted transition-transform ${cityPickerOpen ? "rotate-180" : "group-hover:translate-y-0.5"}`}
          />
        </button>
      </div>
    </div>
    {cityPickerOpen && createPortal(
      <div
        className="location-picker-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeCityPicker()
        }}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="location-picker-title"
          className="location-picker-panel w-full max-w-5xl overflow-hidden rounded-3xl border border-border bg-surface-2 shadow-2xl"
        >
          <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
            <div className="flex min-w-0 flex-nowrap items-center gap-2 whitespace-nowrap text-sm sm:text-base">
              <h2 id="location-picker-title" className="shrink-0 whitespace-nowrap font-extrabold">Choose your location</h2>
              <span aria-hidden className="shrink-0 text-muted">-</span>
              <p className="min-w-0 truncate whitespace-nowrap text-muted">Select a state and city to explore nearby plans.</p>
            </div>
            <button
              type="button"
              onClick={closeCityPicker}
              aria-label="Close location picker"
              className="location-picker-close flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-muted transition-colors hover:bg-text/5 hover:text-text"
            >
              ×
            </button>
          </header>
          <div className="space-y-4 p-5">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <LocationSearchSelect
                key={`state-${cityPickerOpen}`}
                id="location-state"
                label="State / union territory"
                value={selectedState}
                options={INDIA_STATES.map(({ name }) => name)}
                placeholder="Search all Indian states"
                emptyMessage="No state matches that search"
                onSelect={chooseState}
                onInputChange={() => chooseState("")}
              />
              <LocationSearchSelect
                key={`city-${selectedState}-${cityPickerOpen}`}
                id="location-city"
                label="City"
                value={draftCity}
                options={cityOptions}
                placeholder={selectedState ? "Type to search cities" : "Choose a state first"}
                disabled={!selectedState}
                loading={citiesLoading}
                emptyMessage={citiesError ? "City list unavailable" : "No city matches that search"}
                onSelect={chooseCity}
                onInputChange={clearDraftCity}
              />
              <button
                type="button"
                onClick={useMyLocation}
                disabled={locating}
                className="mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-mint transition duration-200 hover:border-mint/35 hover:bg-mint/10 disabled:opacity-60"
              >
                <NavigationIcon className="h-4 w-4" />
                {locating ? "Locating…" : "Use my location"}
              </button>
            </div>
            {citiesLoading && selectedState && (
              <p role="status" className="text-xs text-muted">Loading cities in {selectedState}…</p>
            )}
            {citiesError && (
              <p role="alert" className="flex items-center justify-between gap-3 text-xs text-danger">
                <span>{citiesError}</span>
                <button
                  type="button"
                  onClick={() => {
                    setCitiesLoading(true)
                    setCitiesRetry((attempt) => attempt + 1)
                  }}
                  className="shrink-0 font-bold underline underline-offset-2"
                >
                  Retry
                </button>
              </p>
            )}
            {locationNote && <p role="status" className="text-xs text-muted">{locationNote}</p>}
            <div
              ref={mapContainerRef}
              className="location-picker-map h-[clamp(340px,58vh,620px)] overflow-hidden rounded-2xl border border-border"
              aria-label="Map of India and selected state or city"
            />
            <p className="text-xs text-muted">
              Select a state to fly to it, then search and choose a city to zoom in.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeCityPicker}
                className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-muted transition hover:text-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyCity}
                disabled={!draftCity || !draftCoordinates || cityResolving}
                className="rounded-xl bg-mint px-5 py-2.5 text-sm font-extrabold text-bg transition duration-200 hover:bg-mint/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Apply location
              </button>
            </div>
          </div>
        </section>
      </div>,
      document.body,
    )}
    </>
  );
}

export default function Navbar() {
  const {
    currentUser,
  } = useApp();
  const { isAuthenticated } = useAuth();
  const { pathname } = useLocation();

  return (
    <>
    <header className="sticky top-0 z-40 border-b border-border/60 bg-bg/90 backdrop-blur-md">
      <div className="wide-screen-container mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3 sm:px-6 lg:flex-nowrap lg:py-4">
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
          <ThemeToggle />

          {isAuthenticated && (
            <>
              <FriendsMenu />
              <div className="hidden shrink-0 xl:block">
                <PeopleSearch compact />
              </div>
            </>
          )}
          <NavLink
            to="/inbox"
            className={({ isActive }) => `hidden md:flex ${tabClass({ isActive })}`}
            aria-label="Inbox"
          >
            <ChatIcon className="h-4 w-4" />
            <TabTooltip>Inbox</TabTooltip>
          </NavLink>

          {isAuthenticated ? (
            <div className="flex items-center gap-2 shrink-0 sm:gap-3">
              <Notifications />

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
      <div className="mx-auto grid h-16 max-w-xl grid-cols-6 px-1">
        <MobileNavItem to="/" icon={HomeIcon} label="Home" />
        <MobileNavItem to="/explore" icon={CompassIcon} label="Explore" />
        <MobileNavItem to="/create" icon={PlusIcon} label="Create" primary />
        <MobileNavItem to="/people" icon={UsersIcon} label="People" />
        <MobileNavItem to="/inbox" icon={ChatIcon} label="Inbox" />
        <MobileNavItem to="/profile" icon={UserIcon} label="Me" />
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
