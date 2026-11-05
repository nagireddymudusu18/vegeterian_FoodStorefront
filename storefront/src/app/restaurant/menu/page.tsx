"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/features/auth";
import {
  applyBulkAvailabilityToMenu,
  CertBadge,
  computeBulkPricePreview,
  DietBadges,
  findDietViolations,
  selectDishesByAvailability,
  summarizeBulkSelection,
  toggleDishSelection,
  toggleSelectAllDishes,
  toList,
  type BulkPriceMode,
} from "@/features/catalog";
import { adminRestaurants, catalog, identity, type MenuItem, type Restaurant } from "@/lib/api";
import { formatPaise } from "@/lib/money";
import { ConfirmDialog, Empty, ErrorBox, Spinner } from "@/components/ui";

export default function RestaurantMenuPage() {
  const { me } = useAuth();
  const [restaurants, setRestaurants] = useState<Restaurant[] | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [menu, setMenu] = useState<MenuItem[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedDishIds, setSelectedDishIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkPriceMode, setBulkPriceMode] = useState<BulkPriceMode>("SET_EXACT");
  const [bulkPriceValue, setBulkPriceValue] = useState<string>("");
  const [confirmPriceOpen, setConfirmPriceOpen] = useState(false);

  // Dish editor state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priceRupees, setPriceRupees] = useState("150");
  const [isPureVeg, setIsPureVeg] = useState(true);
  const [isVegan, setIsVegan] = useState(false);
  const [isJain, setIsJain] = useState(false);
  const [ingredientsText, setIngredientsText] = useState("");
  const [allergensText, setAllergensText] = useState("");
  const [available, setAvailable] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!me) return;
    const isAdmin = identity.isAdmin(me);
    adminRestaurants
      .list()
      .then((all) => {
        const owned = isAdmin ? all : all.filter((r) => r.ownerUserId === me.id);
        setRestaurants(owned);
        if (owned.length > 0) setSelectedId((prev) => prev || owned[0].id);
      })
      .catch(setError);
  }, [me]);

  const loadMenu = useCallback(async (rid: string) => {
    if (!rid) return;
    setMenu(null);
    try {
      const items = await catalog.menu(rid, null);
      setMenu(items);
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => {
    setSelectedDishIds([]);
    setConfirmPriceOpen(false);
    if (selectedId) void loadMenu(selectedId);
  }, [selectedId, loadMenu]);

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setPriceRupees("150");
    setIsPureVeg(true);
    setIsVegan(false);
    setIsJain(false);
    setIngredientsText("");
    setAllergensText("");
    setAvailable(true);
  };

  const startEdit = (item: MenuItem) => {
    setEditingId(item.id);
    setName(item.name);
    setDescription(item.description ?? "");
    setPriceRupees((item.pricePaise / 100).toFixed(2));
    setIsPureVeg(item.isPureVeg);
    setIsVegan(item.isVegan);
    setIsJain(item.isJain);
    setIngredientsText(toList(item.ingredients).join(", "));
    setAllergensText(toList(item.containsAllergens).join(", "));
    setAvailable(item.available);
  };

  const toggleAvailability = async (item: MenuItem) => {
    setBusyId(item.id);
    setError(null);
    try {
      const updated = await catalog.setAvailability(item.id, !item.available);
      setMenu((prev) => (prev ? prev.map((m) => (m.id === item.id ? updated : m)) : prev));
      toast.success(updated.available ? `${item.name} marked available` : `${item.name} 86'd (unavailable)`);
    } catch (e) {
      setError(e);
    } finally {
      setBusyId(null);
    }
  };

  const bulkSummary = useMemo(
    () => summarizeBulkSelection(menu ?? [], selectedDishIds),
    [menu, selectedDishIds],
  );

  const handleToggleSelectDish = (id: string) => {
    setSelectedDishIds((prev) => toggleDishSelection(prev, id));
  };

  const handleSelectAll = () => {
    setSelectedDishIds((prev) => toggleSelectAllDishes(menu ?? [], prev));
  };

  const handleSelectByStatus = (targetAvailable: boolean) => {
    setSelectedDishIds(selectDishesByAvailability(menu ?? [], targetAvailable));
  };

  const handleBulkSetAvailability = async (targetAvailable: boolean) => {
    if (bulkSummary.selectedIds.length === 0) return;
    setBulkBusy(true);
    setError(null);
    try {
      const updatedItems = await catalog.setBulkAvailability(bulkSummary.selectedIds, targetAvailable);
      setMenu((prev) => (prev ? applyBulkAvailabilityToMenu(prev, updatedItems) : prev));
      const count = updatedItems.length;
      toast.success(
        targetAvailable
          ? `Marked ${count} ${count === 1 ? "dish" : "dishes"} available`
          : `86'd ${count} ${count === 1 ? "dish" : "dishes"} (marked unavailable)`,
      );
    } catch (e) {
      setError(e);
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkInvertAvailability = async () => {
    if (bulkSummary.selectedIds.length === 0) return;
    setBulkBusy(true);
    setError(null);
    try {
      const calls: Promise<MenuItem[]>[] = [];
      if (bulkSummary.targetIdsToMakeAvailable.length > 0) {
        calls.push(catalog.setBulkAvailability(bulkSummary.targetIdsToMakeAvailable, true));
      }
      if (bulkSummary.targetIdsToMakeUnavailable.length > 0) {
        calls.push(catalog.setBulkAvailability(bulkSummary.targetIdsToMakeUnavailable, false));
      }
      const batches = await Promise.all(calls);
      const updatedItems = batches.flat();
      setMenu((prev) => (prev ? applyBulkAvailabilityToMenu(prev, updatedItems) : prev));
      const count = updatedItems.length;
      toast.success(
        `Toggled availability for ${count} ${count === 1 ? "dish" : "dishes"} (${bulkSummary.targetIdsToMakeAvailable.length} available, ${bulkSummary.targetIdsToMakeUnavailable.length} 86'd)`,
      );
    } catch (e) {
      setError(e);
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkPricePreview = useMemo(
    () => computeBulkPricePreview(menu ?? [], selectedDishIds, bulkPriceMode, bulkPriceValue),
    [menu, selectedDishIds, bulkPriceMode, bulkPriceValue],
  );

  const handleApplyBulkPrices = async () => {
    if (!bulkPricePreview.valid || bulkPricePreview.changes.length === 0) return;
    setBulkBusy(true);
    setError(null);
    try {
      const updatedItems = await catalog.setBulkPrices(
        bulkPricePreview.changes.map((c) => ({ itemId: c.id, pricePaise: c.newPricePaise })),
      );
      setMenu((prev) => (prev ? applyBulkAvailabilityToMenu(prev, updatedItems) : prev));
      setConfirmPriceOpen(false);
      setBulkPriceValue("");
      const count = updatedItems.length;
      toast.success(`Updated price for ${count} ${count === 1 ? "dish" : "dishes"}`);
    } catch (e) {
      setError(e);
    } finally {
      setBulkBusy(false);
    }
  };

  const parsedIngredients = useMemo(() => toList(ingredientsText), [ingredientsText]);
  const parsedAllergens = useMemo(() => toList(allergensText), [allergensText]);
  const violations = useMemo(
    () => findDietViolations(isPureVeg, isVegan, isJain, parsedIngredients),
    [isPureVeg, isVegan, isJain, parsedIngredients],
  );
  const pricePaise = Math.round(Number(priceRupees) * 100);
  const canSave = name.trim().length > 0 && Number.isFinite(pricePaise) && pricePaise >= 0 && violations.length === 0;

  const saveDish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !canSave) return;
    setSaving(true);
    setError(null);
    const payload = {
      name: name.trim(),
      description: description.trim(),
      pricePaise,
      isPureVeg,
      isVegan,
      isJain,
      ingredients: parsedIngredients,
      containsAllergens: parsedAllergens,
      available,
    };
    try {
      if (editingId) {
        await catalog.updateItem(editingId, payload);
        toast.success(`Updated ${payload.name}`);
      } else {
        await catalog.addItem(selectedId, payload);
        toast.success(`Added ${payload.name}`);
      }
      resetForm();
      await loadMenu(selectedId);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  if (!restaurants) return <Spinner label="Loading kitchen menu" />;
  if (restaurants.length === 0) {
    return <Empty>No restaurant is linked to your account yet. Ask an admin to link your account in Admin &rarr; Restaurants.</Empty>;
  }

  const currentRestaurant = restaurants.find((r) => r.id === selectedId) ?? restaurants[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Menu &amp; 86 availability</h1>
          <p className="text-sm text-stone-600">
            Toggle dish availability in real time or add/edit dishes with live Pure-Veg, Vegan, and Jain ingredient checks.
          </p>
        </div>
        {restaurants.length > 1 && (
          <label className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-stone-700">Kitchen:</span>
            <select
              value={selectedId}
              onChange={(e) => {
                setSelectedId(e.target.value);
                resetForm();
              }}
              className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium"
            >
              {restaurants.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {currentRestaurant && (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-bold">{currentRestaurant.name}</h2>
              <CertBadge level={currentRestaurant.kitchenCertificationLevel} />
            </div>
            <p className="text-xs text-stone-600">
              FSSAI #{currentRestaurant.fssaiNumber ?? "—"} · Delivery radius:{" "}
              {((currentRestaurant.deliveryRadiusMeters ?? 5000) / 1000).toFixed(1)} km
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={currentRestaurant.open}
            onClick={async () => {
              try {
                const updated = await catalog.setRestaurantStatus(
                  currentRestaurant.id,
                  !currentRestaurant.open,
                  currentRestaurant.deliveryRadiusMeters,
                );
                setRestaurants((prev) =>
                  prev ? prev.map((r) => (r.id === currentRestaurant.id ? { ...r, open: updated.open } : r)) : prev,
                );
                toast.success(
                  updated.open
                    ? `${currentRestaurant.name} is now accepting orders`
                    : `${currentRestaurant.name} is paused for new orders`,
                );
              } catch (e) {
                setError(e);
              }
            }}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
              currentRestaurant.open
                ? "bg-green-800 text-white hover:bg-green-900"
                : "bg-amber-100 text-amber-950 ring-1 ring-amber-400 hover:bg-amber-200"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${currentRestaurant.open ? "bg-emerald-300" : "bg-amber-600"}`} />
            {currentRestaurant.open ? "Accepting orders" : "Kitchen paused"}
          </button>
        </div>
      )}

      {error !== null && <ErrorBox error={error} />}

      <form onSubmit={saveDish} className="card space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{editingId ? "Edit dish" : "Add a new dish"}</h2>
          {editingId && (
            <button type="button" onClick={resetForm} className="text-sm font-medium text-stone-600 underline">
              Cancel edit
            </button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="font-medium text-stone-700">Dish name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Jain Dal Tadka"
              required
              className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-stone-700">Price (₹)</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={priceRupees}
              onChange={(e) => setPriceRupees(e.target.value)}
              required
              className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
            />
          </label>
        </div>

        <label className="block space-y-1 text-sm">
          <span className="font-medium text-stone-700">Description</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description shown on the menu"
            className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-stone-700">Ingredients (comma-separated)</span>
            <input
              value={ingredientsText}
              onChange={(e) => setIngredientsText(e.target.value)}
              placeholder="e.g. toor dal, cumin, tomato, ghee"
              className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-stone-700">Allergens (comma-separated)</span>
            <input
              value={allergensText}
              onChange={(e) => setAllergensText(e.target.value)}
              placeholder="e.g. milk, peanuts, gluten"
              className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-4 pt-1 text-sm">
          <label className="inline-flex items-center gap-2 font-medium">
            <input
              type="checkbox"
              checked={isPureVeg}
              onChange={(e) => setIsPureVeg(e.target.checked)}
              className="h-4 w-4 rounded accent-green-700"
            />
            Pure Veg
          </label>
          <label className="inline-flex items-center gap-2 font-medium">
            <input
              type="checkbox"
              checked={isVegan}
              onChange={(e) => {
                setIsVegan(e.target.checked);
                if (e.target.checked) setIsPureVeg(true);
              }}
              className="h-4 w-4 rounded accent-green-700"
            />
            Vegan (no dairy/ghee/honey)
          </label>
          <label className="inline-flex items-center gap-2 font-medium">
            <input
              type="checkbox"
              checked={isJain}
              onChange={(e) => {
                setIsJain(e.target.checked);
                if (e.target.checked) setIsPureVeg(true);
              }}
              className="h-4 w-4 rounded accent-green-700"
            />
            Jain (no root veg / onion / garlic / mushroom)
          </label>
          <label className="inline-flex items-center gap-2 font-medium">
            <input
              type="checkbox"
              checked={available}
              onChange={(e) => setAvailable(e.target.checked)}
              className="h-4 w-4 rounded accent-green-700"
            />
            Available now
          </label>
        </div>

        {violations.length > 0 && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900">
            <p className="font-bold">Diet rule guardrail triggered:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {violations.map((v, i) => (
                <li key={i}>{v}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end">
          <button type="submit" disabled={!canSave || saving} className="btn-primary py-2.5 text-sm">
            {saving ? "Saving..." : editingId ? "Save changes" : "Add dish to menu"}
          </button>
        </div>
      </form>

      <section className="space-y-3" aria-labelledby="current-menu-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="current-menu-heading" className="text-lg font-bold">
            Current menu {menu ? `(${menu.length})` : ""}
          </h2>
          {menu && menu.length > 0 && (
            <span className="text-xs font-medium text-stone-600" aria-live="polite">
              {menu.filter((m) => m.available).length} available · {menu.filter((m) => !m.available).length} 86&apos;d
            </span>
          )}
        </div>
        {!menu ? (
          <Spinner label="Loading menu items" />
        ) : menu.length === 0 ? (
          <Empty>No dishes on this menu yet.</Empty>
        ) : (
          <>
            <div
              role="region"
              aria-label="Bulk availability actions"
              className="card space-y-3 border-stone-300 bg-[#FBF6EA] p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5 text-xs">
                  <label className="inline-flex cursor-pointer items-center gap-2 font-bold text-stone-900">
                    <input
                      type="checkbox"
                      checked={bulkSummary.allSelected}
                      onChange={handleSelectAll}
                      aria-label="Select all dishes"
                      className="h-4 w-4 rounded accent-green-700"
                    />
                    <span>{bulkSummary.allSelected ? "Deselect all" : `Select all (${menu.length})`}</span>
                  </label>
                  <span className="text-stone-300" aria-hidden>
                    |
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSelectByStatus(true)}
                    className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 font-semibold text-stone-700 hover:bg-stone-100"
                  >
                    Select available ({menu.filter((m) => m.available).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectByStatus(false)}
                    className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 font-semibold text-stone-700 hover:bg-stone-100"
                  >
                    Select 86&apos;d ({menu.filter((m) => !m.available).length})
                  </button>
                  {bulkSummary.totalSelected > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedDishIds([])}
                      className="font-semibold text-stone-600 underline hover:text-stone-900"
                    >
                      Clear ({bulkSummary.totalSelected})
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-stone-700" aria-live="polite">
                    {bulkSummary.totalSelected === 0
                      ? "Select dishes to bulk-edit"
                      : `${bulkSummary.totalSelected} selected (${bulkSummary.availableCount} available, ${bulkSummary.unavailableCount} 86'd)`}
                  </span>
                  <button
                    type="button"
                    disabled={bulkBusy || bulkSummary.totalSelected === 0}
                    onClick={() => void handleBulkSetAvailability(true)}
                    className="rounded-xl bg-green-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-800 disabled:opacity-45"
                  >
                    {bulkBusy ? "Updating..." : "Mark selected available"}
                  </button>
                  <button
                    type="button"
                    disabled={bulkBusy || bulkSummary.totalSelected === 0}
                    onClick={() => void handleBulkSetAvailability(false)}
                    className="rounded-xl bg-amber-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-800 disabled:opacity-45"
                  >
                    {bulkBusy ? "Updating..." : "86 selected (Mark unavailable)"}
                  </button>
                  <button
                    type="button"
                    disabled={bulkBusy || bulkSummary.totalSelected === 0}
                    onClick={() => void handleBulkInvertAvailability()}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold text-stone-800 hover:bg-stone-100 disabled:opacity-45"
                  >
                    {bulkBusy ? "Updating..." : "Toggle selected availability"}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-stone-300/80 pt-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-bold text-stone-800">Bulk price update:</span>
                  <select
                    aria-label="Bulk price update mode"
                    value={bulkPriceMode}
                    onChange={(e) => setBulkPriceMode(e.target.value as BulkPriceMode)}
                    className="rounded-xl border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-800"
                  >
                    <option value="SET_EXACT">Set exact price (₹)</option>
                    <option value="ADJUST_AMOUNT">Adjust by amount (+/- ₹)</option>
                    <option value="ADJUST_PERCENT">Adjust by percentage (+/- %)</option>
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    aria-label="Bulk price value"
                    value={bulkPriceValue}
                    onChange={(e) => setBulkPriceValue(e.target.value)}
                    placeholder={
                      bulkPriceMode === "SET_EXACT"
                        ? "New price (₹), e.g. 180"
                        : bulkPriceMode === "ADJUST_AMOUNT"
                          ? "Delta (₹), e.g. 20 or -15"
                          : "Delta (%), e.g. 10 or -5"
                    }
                    className="w-44 rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs text-stone-900"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {bulkSummary.totalSelected > 0 && bulkPriceValue.trim().length > 0 && bulkPricePreview.error && (
                    <span role="alert" className="text-xs font-semibold text-red-700">
                      {bulkPricePreview.error}
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={bulkBusy || !bulkPricePreview.valid}
                    onClick={() => setConfirmPriceOpen(true)}
                    className="rounded-xl bg-[#1B5E3A] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-green-900 disabled:opacity-45"
                  >
                    Update selected prices...
                  </button>
                </div>
              </div>
            </div>

            <ul className="space-y-3">
              {menu.map((item) => {
                const isSelected = bulkSummary.selectedIds.includes(item.id);
                return (
                  <li
                    key={item.id}
                    className={`card flex flex-wrap items-center justify-between gap-3 p-4 transition-colors ${
                      isSelected ? "border-[#1B5E3A] bg-green-50/40 ring-1 ring-[#1B5E3A]" : ""
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelectDish(item.id)}
                        aria-label={`Select ${item.name}`}
                        className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded accent-green-700"
                      />
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <DietBadges item={item} />
                          <span className="font-bold">{item.name}</span>
                          <span className="text-sm font-semibold text-stone-700">{formatPaise(item.pricePaise)}</span>
                          {!item.available && (
                            <span className="rounded bg-stone-200 px-2 py-0.5 text-xs font-semibold text-stone-700">
                              86&apos;d
                            </span>
                          )}
                        </div>
                        {item.description && <p className="text-xs text-stone-600">{item.description}</p>}
                        {toList(item.ingredients).length > 0 && (
                          <p className="text-xs text-stone-500">Ingredients: {toList(item.ingredients).join(", ")}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(item)}
                        className="rounded-xl border border-stone-300 px-3 py-1.5 text-xs font-semibold hover:bg-stone-100"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busyId === item.id || bulkBusy}
                        onClick={() => void toggleAvailability(item)}
                        className={`rounded-xl px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50 ${
                          item.available ? "bg-amber-700 hover:bg-amber-800" : "bg-green-700 hover:bg-green-800"
                        }`}
                      >
                        {item.available ? "86 (Mark unavailable)" : "Mark available"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <ConfirmDialog
        open={confirmPriceOpen}
        title={`Confirm bulk price update (${bulkPricePreview.changes.length} ${bulkPricePreview.changes.length === 1 ? "dish" : "dishes"})`}
        confirmLabel="Confirm & apply prices"
        cancelLabel="Cancel"
        busy={bulkBusy}
        onConfirm={() => void handleApplyBulkPrices()}
        onCancel={() => setConfirmPriceOpen(false)}
      >
        <div className="space-y-3">
          <p className="text-xs text-stone-600">
            Review the new prices below before applying. Active carts and new orders will immediately use the updated server prices.
          </p>
          <ul className="max-h-56 divide-y divide-stone-200 overflow-y-auto rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs">
            {bulkPricePreview.changes.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-1.5">
                <span className="truncate font-semibold text-stone-900">{c.name}</span>
                <span className="shrink-0 font-mono text-stone-700">
                  <span className="line-through text-stone-400">{formatPaise(c.oldPricePaise)}</span>{" "}
                  <span aria-hidden>&rarr;</span>{" "}
                  <strong className="font-bold text-[#1B5E3A]">{formatPaise(c.newPricePaise)}</strong>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </ConfirmDialog>
    </div>
  );
}
