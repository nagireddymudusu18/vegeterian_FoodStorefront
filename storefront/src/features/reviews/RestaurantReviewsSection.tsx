"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { catalog, errorMessage, type RestaurantRatingSummary, type RestaurantReview } from "@/lib/api";
import { useAuth } from "@/features/auth";
import { ButtonSpinner } from "@/components/ui";
import { REVIEW_HIGHLIGHT_TAGS } from "./reviews-engine";

export function StarRatingDisplay({
  rating,
  count,
  size = "sm",
}: {
  rating: number;
  count?: number;
  size?: "sm" | "md";
}) {
  if (!rating || rating <= 0) {
    return <span className="text-xs text-stone-500">New kitchen</span>;
  }
  const textClass = size === "md" ? "text-sm font-bold" : "text-xs font-bold";
  return (
    <span className={`inline-flex items-center gap-1 tabular-nums ${textClass}`}>
      <span aria-hidden="true" className="text-amber-500">
        ★
      </span>
      <span>{rating.toFixed(1)}</span>
      {count !== undefined && (
        <span className="font-normal opacity-80">
          ({count} {count === 1 ? "review" : "reviews"})
        </span>
      )}
    </span>
  );
}

export function RestaurantReviewsSection({
  restaurantId,
  restaurantName,
  menuDishNames = [],
  orderId,
  onSummaryUpdated,
}: {
  restaurantId: string;
  restaurantName: string;
  menuDishNames?: string[];
  orderId?: string | null;
  onSummaryUpdated?: (summary: RestaurantRatingSummary) => void;
}) {
  const { status } = useAuth();
  const authed = status === "authed";

  const [summary, setSummary] = useState<RestaurantRatingSummary | null>(null);
  const [reviews, setReviews] = useState<RestaurantReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(Boolean(orderId));
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>(["100% Pure Veg Trust"]);
  const [selectedDishes, setSelectedDishes] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  const loadReviews = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const res = await catalog.reviews(restaurantId, signal);
        setSummary(res.summary);
        setReviews(res.reviews);
        onSummaryUpdated?.(res.summary);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    },
    [restaurantId, onSummaryUpdated],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    void loadReviews(ctrl.signal);
    return () => ctrl.abort();
  }, [loadReviews]);

  const toggleTag = (tag: string) => {
    setSelectedTags((cur) =>
      cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag].slice(0, 4),
    );
  };

  const toggleDish = (dish: string) => {
    setSelectedDishes((cur) =>
      cur.includes(dish) ? cur.filter((d) => d !== dish) : [...cur, dish].slice(0, 4),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    if (comment.trim().length < 6) {
      setFormErr("Please share at least 6 characters about your meal or packaging.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await catalog.addReview(restaurantId, {
        rating,
        comment: comment.trim(),
        tags: selectedTags,
        dishNames: selectedDishes,
        orderId: orderId ?? null,
      });
      setSummary(res.summary);
      setReviews((prev) => [res.review, ...prev]);
      onSummaryUpdated?.(res.summary);
      setComment("");
      setShowForm(false);
      toast.success(`Thank you for reviewing ${restaurantName}!`);
    } catch (err) {
      setFormErr(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !summary) {
    return (
      <section className="card p-5 text-sm text-stone-500" aria-busy="true">
        Loading verified customer reviews…
      </section>
    );
  }

  const totalCount = summary?.reviewCount ?? 0;

  return (
    <section aria-labelledby="reviews-heading" className="card space-y-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-200 pb-4">
        <div>
          <h2 id="reviews-heading" className="text-lg font-extrabold text-ink sm:text-xl">
            Verified Customer Reviews &amp; Ratings
          </h2>
          <p className="mt-0.5 text-xs text-stone-600">
            Ranked by Wilson 95% confidence score ({((summary?.wilsonScore ?? 0) * 100).toFixed(0)}% confidence index) from verified orders
          </p>
        </div>
        {authed ? (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="btn-secondary px-3.5 py-2 text-xs"
          >
            {showForm ? "Cancel review" : "Write a review"}
          </button>
        ) : (
          <Link href={`/login?next=/restaurants/${encodeURIComponent(restaurantId)}`} className="text-xs font-bold text-green-800 underline">
            Sign in to rate this kitchen
          </Link>
        )}
      </div>

      {/* Rating Breakdown Summary */}
      {summary && totalCount > 0 && (
        <div className="grid gap-5 sm:grid-cols-12">
          <div className="flex flex-col justify-center rounded-2xl bg-stone-50 p-4 text-center sm:col-span-4">
            <p className="font-mono text-4xl font-extrabold tabular-nums text-ink">
              {summary.averageRating.toFixed(1)} <span className="text-amber-500">★</span>
            </p>
            <p className="mt-1 text-xs font-semibold text-stone-600">
              Based on {totalCount} verified {totalCount === 1 ? "review" : "reviews"}
            </p>
            {summary.topTags.length > 0 && (
              <p className="mt-2 text-xs text-green-800 font-semibold">
                Top praised: {summary.topTags.map((t) => t.tag).slice(0, 2).join(" · ")}
              </p>
            )}
          </div>

          <div className="space-y-1.5 sm:col-span-8">
            {([5, 4, 3, 2, 1] as const).map((star) => {
              const count = summary.distribution[star] ?? 0;
              const pct = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0;
              return (
                <div key={star} className="flex items-center gap-2.5 text-xs">
                  <span className="w-8 font-mono font-bold tabular-nums text-stone-700">{star} ★</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-200">
                    <div
                      className="h-full rounded-full bg-amber-500 transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-10 text-right font-mono tabular-nums text-stone-500">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Interactive Review Submission Form */}
      {showForm && authed && (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-green-200 bg-green-50/40 p-4" noValidate>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-bold text-stone-900">Your rating for {restaurantName}</span>
            <div className="flex items-center gap-1" role="radiogroup" aria-label="Star rating">
              {[1, 2, 3, 4, 5].map((star) => {
                const active = (hoverRating ?? rating) >= star;
                return (
                  <button
                    key={star}
                    type="button"
                    role="radio"
                    aria-checked={rating === star}
                    aria-label={`${star} ${star === 1 ? "star" : "stars"}`}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(null)}
                    onClick={() => setRating(star)}
                    className={`h-9 w-9 rounded-lg text-xl transition ${
                      active ? "text-amber-500 scale-105" : "text-stone-300 hover:text-amber-300"
                    }`}
                  >
                    ★
                  </button>
                );
              })}
              <span className="ml-1 font-mono text-xs font-bold text-stone-800">{rating}/5</span>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-stone-700">What stood out? (optional)</p>
            <div className="flex flex-wrap gap-1.5">
              {REVIEW_HIGHLIGHT_TAGS.map((tag) => {
                const active = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleTag(tag)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                      active
                        ? "border-green-700 bg-green-700 text-white"
                        : "border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
                    }`}
                  >
                    {active ? `✓ ${tag}` : tag}
                  </button>
                );
              })}
            </div>
          </div>

          {menuDishNames.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-stone-700">Recommended dishes from your order:</p>
              <div className="flex flex-wrap gap-1.5">
                {menuDishNames.slice(0, 8).map((dish) => {
                  const active = selectedDishes.includes(dish);
                  return (
                    <button
                      key={dish}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleDish(dish)}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                        active
                          ? "border-amber-600 bg-amber-500 font-bold text-stone-950"
                          : "border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
                      }`}
                    >
                      {active ? `★ ${dish}` : dish}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label htmlFor="review-comment" className="mb-1 block text-xs font-semibold text-stone-800">
              Your review
            </label>
            <textarea
              id="review-comment"
              rows={3}
              maxLength={400}
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
                if (formErr) setFormErr(null);
              }}
              placeholder="How was the taste, dietary adherence, and packaging?"
              className="w-full rounded-xl border border-stone-300 bg-white p-3 text-sm focus:border-green-600 focus:outline-none"
            />
            <div className="mt-1 flex justify-between text-[11px] text-stone-500">
              <span>Minimum 6 characters</span>
              <span className="font-mono">{comment.length}/400</span>
            </div>
          </div>

          {formErr && (
            <p role="alert" className="text-xs font-semibold text-red-700">
              {formErr}
            </p>
          )}

          <div className="flex justify-end">
            <button type="submit" disabled={submitting} className="btn-primary px-5 py-2 text-xs">
              {submitting && <ButtonSpinner />}
              {submitting ? "Posting review..." : "Post verified review"}
            </button>
          </div>
        </form>
      )}

      {/* Review List */}
      {reviews.length === 0 ? (
        <p className="text-sm text-stone-600">No reviews yet. Be the first to review {restaurantName}!</p>
      ) : (
        <ul className="divide-y divide-stone-200/80">
          {reviews.map((rev) => (
            <li key={rev.id} className="space-y-1.5 py-3.5 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-bold text-stone-900">{rev.authorName}</span>
                  <span aria-hidden="true" className="text-stone-400">·</span>
                  <span className="font-mono font-bold text-amber-600">
                    {"★".repeat(rev.rating)}
                    {"☆".repeat(Math.max(0, 5 - rev.rating))}
                  </span>
                  {rev.verifiedOrder && (
                    <>
                      <span aria-hidden="true" className="text-stone-400">·</span>
                      <span className="font-semibold text-green-800">Verified order</span>
                    </>
                  )}
                </div>
                <time dateTime={rev.createdAt} className="font-mono text-[11px] text-stone-500">
                  {new Date(rev.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                </time>
              </div>
              <p className="text-sm leading-relaxed text-stone-800">{rev.comment}</p>
              {(rev.tags.length > 0 || rev.dishNames.length > 0) && (
                <p className="text-xs text-stone-500">
                  {[
                    ...rev.tags,
                    ...rev.dishNames.map((d) => `Tried: ${d}`),
                  ].join(" · ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
