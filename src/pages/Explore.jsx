import { useEffect, useMemo, useRef, useState } from "react";

import { Link, useLocation, useSearchParams } from "react-router-dom";

import { categories, vibes } from "../data/mockData";

import { useApp } from "../context/AppContext";

import AvatarStack from "../components/AvatarStack";
import LockedState from "../components/LockedState";
import { useAuth } from "../context/AuthContext";

import { isPrivateActivity } from "../lib/activities";

import {
  MapPinIcon,
  ShieldCheckIcon,
  ClockIcon,
  ArrowRightIcon,
  ChevronDownIcon,
} from "../components/NavIcons";

const PRIVATE_INITIAL = 3;
const PRIVATE_STEP = 1;

const WEEK_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export default function Explore() {
  const { activities, getVisibleLocation } = useApp();
  const { isAuthenticated } = useAuth();
  const [searchParams] = useSearchParams();

  /* =========================================================
     ISOLATED FILTER STATE (PUBLIC vs PRIVATE)
  ========================================================= */

  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  // A navbar search while already on Explore lands as a new navigation:
  // pick up its ?q= without remounting the page.
  const { key: locationKey } = useLocation();
  const [syncedKey, setSyncedKey] = useState(locationKey);
  if (locationKey !== syncedKey) {
    setSyncedKey(locationKey);
    setQuery(searchParams.get("q") ?? "");
  }

  // Public Section States (Full Width Tracker + Custom Selector Menu)
  const [publicDateFilter, setPublicDateFilter] = useState(
    searchParams.get("date") ?? "All plans",
  );

  const [publicDropdownOpen, setPublicDropdownOpen] = useState(false);
  // Private Section States (Isolated Category Focus Filter State)
  const [privateCategoryFilter, setPrivateCategoryFilter] = useState(
    searchParams.get("category") ?? "Everything",
  );
  // Core Utilities retained from structural layout context
  const [vibe, setVibe] = useState("All vibes");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  /* =========================================================
     PUBLIC CAROUSEL CONTROLS
  ========================================================= */

  const publicScrollRef = useRef(null);
  const [canScrollPublic, setCanScrollPublic] = useState(false);

  function scrollPublicActivities() {
    const row = publicScrollRef.current;
    if (!row) return;

    const card = row.firstElementChild;
    const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
    const step = card ? card.offsetWidth + gap : row.clientWidth;

    row.scrollBy({
      left: Math.max(1, Math.floor(row.clientWidth / step)) * step,
      behavior: "smooth",
    });
  }

  /* =========================================================
     PRIVATE INFINITE SCROLL INDEXERS
  ========================================================= */

  const [privateVisibleCount, setPrivateVisibleCount] =
    useState(PRIVATE_INITIAL);
  const privateLoaderRef = useRef(null);

  /* =========================================================
     ACTIVE GLOBAL ACCELERATOR FILTER METRIC COUNTS
  ========================================================= */

  const activeFilterCount =
    (privateCategoryFilter !== "Everything" ? 1 : 0) +
    (publicDateFilter !== "All plans" ? 1 : 0) +
    (vibe !== "All vibes" ? 1 : 0) +
    (verifiedOnly ? 1 : 0);

  /* =========================================================
     HYBRID FILTER PROCESSING PIPELINES (DECOUPLED DESIGN)
  ========================================================= */

  // Check if the user arrived directly from a specific homepage parameter path
  const isFromHomeCategory = searchParams.has("category");
  const isFromHomeDate = searchParams.has("date");

  // 1. Compute Public Activities (Ignores Category filter UNLESS navigating from home page)
  const publicActivities = useMemo(() => {
    return activities
      .filter((activity) => !isPrivateActivity(activity))
      .filter((activity) => {
        // Apply Date Timeline Filter locally
        if (publicDateFilter !== "All plans") {
          const target = publicDateFilter.toLowerCase();
          const activityDate = (activity.date ?? "").toLowerCase();
          const activityWhen = (activity.when ?? "").toLowerCase();
          if (
            !activityDate.includes(target) &&
            !activityWhen.includes(target)
          ) {
            return false;
          }
        }

        // Apply Category filter ONLY if explicitly clicked from a Home navigation pill
        if (isFromHomeCategory && privateCategoryFilter !== "Everything") {
          if (activity.category !== privateCategoryFilter) return false;
        }

        // Global Search bar filter
        if (query.trim()) {
          const q = query.trim().toLowerCase();
          const haystack =
            `${activity.title ?? ""} ${activity.location ?? ""} ${(activity.tags ?? []).join(" ")}`.toLowerCase();
          if (!haystack.includes(q)) return false;
        }

        return true;
      });
  }, [
    activities,
    query,
    publicDateFilter,
    privateCategoryFilter,
    isFromHomeCategory,
  ]);

  // 2. Compute Private Activities (Ignores Date filter UNLESS navigating from home page)
  const privateActivities = useMemo(() => {
    return activities
      .filter((activity) => isPrivateActivity(activity))
      .filter((activity) => {
        // Apply Category Filter locally
        if (
          privateCategoryFilter !== "Everything" &&
          activity.category !== privateCategoryFilter
        ) {
          return false;
        }

        // Apply Date filter ONLY if explicitly clicked from a Home navigation pill ("I'm free tonight")
        if (isFromHomeDate && publicDateFilter !== "All plans") {
          const target = publicDateFilter.toLowerCase();
          const activityDate = (activity.date ?? "").toLowerCase();
          const activityWhen = (activity.when ?? "").toLowerCase();
          if (
            !activityDate.includes(target) &&
            !activityWhen.includes(target)
          ) {
            return false;
          }
        }

        // Global Search bar filter
        if (query.trim()) {
          const q = query.trim().toLowerCase();
          const haystack =
            `${activity.title ?? ""} ${activity.location ?? ""} ${(activity.tags ?? []).join(" ")}`.toLowerCase();
          if (!haystack.includes(q)) return false;
        }

        return true;
      });
  }, [
    activities,
    query,
    privateCategoryFilter,
    publicDateFilter,
    isFromHomeDate,
  ]);

  // Progressive slice array remains intact for infinite scrolling
  const visiblePrivateActivities = useMemo(() => {
    return privateActivities.slice(0, privateVisibleCount);
  }, [privateActivities, privateVisibleCount]);


  /* =========================================================
     HOOK LIFECYCLES & LAYOUT SYNCHRONIZATION EFFLUENTS
  ========================================================= */

  useEffect(() => {
    setPrivateVisibleCount(PRIVATE_INITIAL);
  }, [query, publicDateFilter, privateCategoryFilter]);

  useEffect(() => {
    const target = privateLoaderRef.current;
    if (!target || visiblePrivateActivities.length >= privateActivities.length)
      return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        setPrivateVisibleCount((current) =>
          Math.min(current + PRIVATE_STEP, privateActivities.length),
        );
      },
      { rootMargin: "300px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [visiblePrivateActivities.length, privateActivities.length]);

  useEffect(() => {
    const row = publicScrollRef.current;
    if (!row) return;

    function update() {
      setCanScrollPublic(
        row.scrollLeft + row.clientWidth < row.scrollWidth - 4,
      );
    }

    const frame = requestAnimationFrame(update);
    const observer = new ResizeObserver(update);

    observer.observe(row);
    row.addEventListener("scroll", update, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      row.removeEventListener("scroll", update);
    };
  }, [publicActivities]);

  function clearFilters() {
    setPublicDateFilter("All plans");
    setPrivateCategoryFilter("Everything");
    setVibe("All vibes");
    setVerifiedOnly(false);
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-12 px-5 py-8 sm:px-6 lg:space-y-14">
      {/* =====================================================
          PAGE HEADER CONTAINER
      ===================================================== */}
      <section>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-mint">
          Explore
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Find something to do.
        </h1>
        <p className="mt-2 text-sm text-muted sm:text-base">
          Discover activities happening around you.
        </p>
      </section>

      {/* =====================================================
          PUBLIC ACTIVITIES + DYNAMIC EXPANSIVE WIDE TIMELINE BAR
      ===================================================== */}
      <section className="space-y-6">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-mint">
              Public
            </p>
            <h2 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">
              Public activities
            </h2>
          </div>

          {/* EYE-CATCHING HORIZONTAL FULL-WIDTH SELECTION STRIP */}
          <div className="w-full rounded-2xl bg-surface-2 p-1.5 border border-border/60 shadow-md">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-1 w-full">
              {["All plans", "Today", "Tomorrow"].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setPublicDateFilter(d);
                    setPublicDropdownOpen(false);
                  }}
                  className={`flex-1 text-center py-1.5 text-sm font-black tracking-wide rounded-xl transition-all ${
                    publicDateFilter === d && !publicDropdownOpen
                      ? "bg-mint text-bg shadow-md"
                      : "text-muted hover:text-text hover:bg-bg/40"
                  }`}
                >
                  {d}
                </button>
              ))}

              {/* Day Dropdown Selection Node Anchor Trigger */}
              <div className="relative flex-1">
                <button
                  type="button"
                  onClick={() => setPublicDropdownOpen(!publicDropdownOpen)}
                  className={`w-full flex items-center justify-center gap-2 py-3 text-sm font-black tracking-wide rounded-xl transition-all border ${
                    publicDropdownOpen || WEEK_DAYS.includes(publicDateFilter)
                      ? "border-mint bg-mint/10 text-mint shadow-sm"
                      : "border-transparent text-muted hover:text-text hover:bg-bg/40"
                  }`}
                >
                  {WEEK_DAYS.includes(publicDateFilter)
                    ? `Day: ${publicDateFilter}`
                    : "Choose Day"}
                  <ChevronDownIcon
                    className={`h-4 w-4 transition-transform duration-200 ${publicDropdownOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {/* Dropdown Popover Custom Layout Drawer */}
                {publicDropdownOpen && (
                  <div
                    className="absolute right-0 left-0 sm:left-auto mt-2 w-full sm:w-56 overflow-hidden rounded-xl border border-border bg-surface-2 p-1.5 shadow-xl z-50 max-h-60 overflow-y-auto"
                    onMouseLeave={() => setPublicDropdownOpen(false)}
                  >
                    {WEEK_DAYS.map((day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          setPublicDateFilter(day);
                          setPublicDropdownOpen(false);
                        }}
                        className={`block w-full text-left px-4 py-2.5 text-xs font-bold rounded-lg transition-colors ${
                          publicDateFilter === day
                            ? "bg-mint text-bg font-extrabold"
                            : "text-text hover:bg-bg/50"
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* PUBLIC CAROUSEL MAIN VIEW WINDOW */}
        {publicActivities.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <p className="font-semibold text-text">Nothing here yet.</p>
            <p className="mt-2 text-sm text-muted">
              Try changing your search or horizontal timeline filters.
            </p>
          </div>
        ) : (
          <div className="relative">
            <div
              ref={publicScrollRef}
              className="scrollbar-none flex snap-x snap-mandatory items-stretch gap-4 overflow-x-auto overscroll-x-contain"
            >
              {publicActivities.map((activity) => (
                <Link
                  key={`public-${activity.id}`}
                  to={`/activities/${activity.id}`}
                  className="group flex w-[72vw] max-w-[270px] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-border bg-surface-2 transition-colors duration-300 hover:border-mint/40 sm:w-[256px] sm:max-w-none lg:w-[272px] 2xl:w-[288px]"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-surface-3">
                    <img
                      src={activity.image}
                      alt={activity.title}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                    />
                    {activity.date && (
                      <span className="absolute left-2.5 top-2.5 rounded-md bg-bg/85 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-mint">
                        {activity.date}
                      </span>
                    )}
                    {activity.host?.verified && (
                      <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-bg/85 px-2 py-1 text-[10px] font-bold text-text">
                        <ShieldCheckIcon className="h-3 w-3 text-mint" />
                        Verified
                      </span>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col p-3.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-mint">
                      {activity.category}
                    </p>
                    <h3 className="mt-1 line-clamp-2 text-base font-extrabold leading-snug">
                      {activity.title}
                    </h3>
                    {activity.location && (
                      <p className="mt-2 flex items-center gap-1.5 text-[13px] text-muted">
                        <MapPinIcon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{activity.location}</span>
                      </p>
                    )}
                    {(activity.time || activity.when) && (
                      <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted">
                        <ClockIcon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">
                          {activity.when || activity.time}
                        </span>
                      </p>
                    )}
                    <div className="mt-auto pt-3">
                      <div className="border-t border-border pt-3">
                        {activity.host?.name && (
                          <p className="truncate text-[13px] font-semibold">
                            Hosted by {activity.host.name}
                          </p>
                        )}
                        <p className="mt-0.5 text-xs text-muted">
                          {activity.going?.length ?? activity.attendees ?? 0}{" "}
                          people going
                        </p>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {canScrollPublic && (
              <button
                type="button"
                onClick={scrollPublicActivities}
                aria-label="Show more public activities"
                className="absolute -right-3 top-1/2 z-10 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-mint text-bg shadow-lg shadow-black/40 transition-transform duration-200 hover:scale-105 sm:flex"
              >
                <ArrowRightIcon className="h-5 w-5" />
              </button>
            )}
          </div>
        )}
      </section>

      {/* =====================================================
          PRIVATE ACTIVITIES + DYNAMIC WIDE INTEREST MATRIX STRIP
      ===================================================== */}
      <section className="space-y-6">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-mint">
              Private Feed
            </p>
            <h2 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">
              Exclusive activities
            </h2>
          </div>

          {/* EYE-CATCHING STRETCHED CATEGORY OPTION PANEL */}
          <div className="w-full rounded-2xl bg-surface-2 p-1.5 border border-border/60 shadow-md">
            <div className="flex flex-wrap sm:flex-nowrap items-stretch sm:items-center justify-between gap-1 w-full">
              {["Everything", "Food", "Social", "Outdoors", "Sports"].map(
                (cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setPrivateCategoryFilter(cat)}
                    className={`flex-1 text-center py-1.5 text-sm font-black tracking-wide rounded-xl transition-all ${
                      privateCategoryFilter === cat
                        ? "bg-mint text-bg shadow-md"
                        : "text-muted hover:text-text hover:bg-bg/40"
                    }`}
                  >
                    {cat}
                  </button>
                ),
              )}
            </div>
          </div>
        </div>

        {/* AIRBNB RESPONSIVE COMPACT CARD FEED GRID CONTAINER */}
        {!isAuthenticated ? (
          <LockedState />
        ) : privateActivities.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center bg-surface-2/30">
            <p className="font-semibold text-text">
              No matches for this category.
            </p>
            <p className="mt-2 text-sm text-muted">
              There are no private {privateCategoryFilter.toLowerCase()} plans
              listed right now.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {visiblePrivateActivities.map((activity) => {
              const place = getVisibleLocation(activity.id).value;
              const goingCount =
                activity.going?.length ?? activity.attendees ?? 0;

              return (
                <Link
                  key={`private-${activity.id}`}
                  to={`/activities/${activity.id}`}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-surface-2 transition-all duration-300 hover:border-mint/40 hover:shadow-xl hover:shadow-black/20 min-h-[440px]"
                >
                  {/* AIRBNB OPTIMIZED TOP COMPACT PICTURE WRAPPER */}
                  <div className="relative aspect-[16/10] overflow-hidden bg-surface-3 w-full shrink-0">
                    <img
                      src={activity.image}
                      alt={activity.title}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <span className="absolute left-3 top-3 rounded-md bg-bg/85 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-mint backdrop-blur-sm">
                      {activity.date}
                    </span>
                  </div>

                  {/* DETAILS TEXT CONTAINER */}
                  <div className="flex flex-col flex-1 p-5 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-mint">
                        {activity.category}
                      </p>
                      <span className="rounded-md border border-mint/30 bg-mint-soft px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-mint">
                        Private
                      </span>
                    </div>

                    <h3 className="mt-2 line-clamp-2 text-xl font-extrabold leading-snug tracking-tight text-text group-hover:text-mint transition-colors">
                      {activity.title}
                    </h3>

                    <div className="mt-4 space-y-2 text-xs text-muted">
                      {place && (
                        <p className="flex items-center gap-2">
                          <MapPinIcon className="h-4 w-4 shrink-0 text-mint" />
                          <span className="truncate">{place}</span>
                        </p>
                      )}
                      {(activity.when || activity.time) && (
                        <p className="flex items-center gap-2">
                          <ClockIcon className="h-4 w-4 shrink-0 text-mint" />
                          <span className="truncate">
                            {activity.when || activity.time}
                          </span>
                        </p>
                      )}
                    </div>

                    {activity.host?.name && (
                      <div className="mt-5 flex items-center gap-2.5 border-t border-border/40 pt-4">
                        {activity.host.avatar && (
                          <img
                            src={activity.host.avatar}
                            alt=""
                            className="h-7 w-7 shrink-0 rounded-full object-cover border border-border"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs text-muted">
                            Hosted by{" "}
                            <span className="font-semibold text-text">
                              {activity.host.name}
                            </span>
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="mt-auto pt-4 flex items-center justify-between border-t border-border/40">
                      <span className="text-xs text-muted font-medium">
                        <strong className="text-text font-bold">
                          {goingCount}
                        </strong>{" "}
                        going
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-mint">
                        View plan
                        <ArrowRightIcon className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Target loading element hook node for infinite scrolling transitions */}
      <div ref={privateLoaderRef} className="h-2" />
    </div>
  );
}
