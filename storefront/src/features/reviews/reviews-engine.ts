/**
 * Verified Ratings & Reviews Engine with Wilson Score Confidence Interval Ranking
 * Prevents 1-review 5.0★ outliers from outranking consistent 4.8★ kitchens with dozens of reviews.
 */

export interface RestaurantReview {
  id: string;
  restaurantId: string;
  userId: string;
  authorName: string;
  orderId?: string | null;
  verifiedOrder: boolean;
  rating: number; // 1 to 5
  comment: string;
  tags: string[];
  dishNames: string[];
  createdAt: string;
}

export interface RestaurantRatingSummary {
  restaurantId: string;
  averageRating: number;
  reviewCount: number;
  wilsonScore: number; // 0 to 1 lower bound of 95% confidence interval
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  topTags: { tag: string; count: number }[];
  dishMentions: Record<string, number>;
}

export const REVIEW_HIGHLIGHT_TAGS = [
  "100% Pure Veg Trust",
  "Authentic Jain Prep",
  "Hot & Fresh Packaging",
  "Generous Portions",
  "Balanced Spices",
  "Fast Kitchen Dispatch",
] as const;

/**
 * Calculates the lower bound of the Wilson score confidence interval for a Bernoulli parameter.
 * Used by Reddit, Instacart, and Yelp to rank rated items with statistical confidence.
 */
export function wilsonScoreLowerBound(
  positiveVotes: number,
  totalVotes: number,
  z = 1.96, // 95% confidence
): number {
  if (totalVotes <= 0 || positiveVotes <= 0) return 0;
  const pos = Math.min(positiveVotes, totalVotes);
  const phat = pos / totalVotes;
  const z2 = z * z;
  const numerator =
    phat +
    z2 / (2 * totalVotes) -
    z * Math.sqrt((phat * (1 - phat) + z2 / (4 * totalVotes)) / totalVotes);
  const denominator = 1 + z2 / totalVotes;
  return Math.round((numerator / denominator) * 10000) / 10000;
}

/**
 * Aggregates reviews for a restaurant into an average rating, 5-star histogram,
 * Wilson confidence score, and dish upvote counts.
 */
export function computeRestaurantRatingSummary(
  restaurantId: string,
  reviews: RestaurantReview[],
): RestaurantRatingSummary {
  const distribution: Record<1 | 2 | 3 | 4 | 5, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };
  const tagCounts = new Map<string, number>();
  const dishMentions: Record<string, number> = {};

  if (reviews.length === 0) {
    return {
      restaurantId,
      averageRating: 0,
      reviewCount: 0,
      wilsonScore: 0,
      distribution,
      topTags: [],
      dishMentions,
    };
  }

  let sumStars = 0;
  let positiveUtility = 0; // Normalized 0..1 per review: (stars - 1) / 4

  for (const r of reviews) {
    const clamped = Math.max(1, Math.min(5, Math.round(r.rating))) as 1 | 2 | 3 | 4 | 5;
    distribution[clamped] += 1;
    sumStars += clamped;
    positiveUtility += (clamped - 1) / 4;

    for (const tag of r.tags ?? []) {
      const clean = tag.trim();
      if (clean) tagCounts.set(clean, (tagCounts.get(clean) ?? 0) + 1);
    }
    for (const dish of r.dishNames ?? []) {
      const clean = dish.trim();
      if (clean) dishMentions[clean] = (dishMentions[clean] ?? 0) + 1;
    }
  }

  const averageRating = Math.round((sumStars / reviews.length) * 10) / 10;
  const wilsonScore = wilsonScoreLowerBound(positiveUtility, reviews.length);
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 4)
    .map(([tag, count]) => ({ tag, count }));

  return {
    restaurantId,
    averageRating,
    reviewCount: reviews.length,
    wilsonScore,
    distribution,
    topTags,
    dishMentions,
  };
}

export function validateReviewSubmission(input: {
  rating: number;
  comment: string;
  tags?: string[];
}): { ok: true; rating: number; comment: string; tags: string[] } | { ok: false; error: string } {
  const rating = Math.round(Number(input.rating));
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: "Select a star rating between 1 and 5." };
  }
  const comment = input.comment.trim();
  if (comment.length < 6) {
    return {
      ok: false,
      error: "Share a brief note about the food or packaging (at least 6 characters).",
    };
  }
  if (comment.length > 400) {
    return { ok: false, error: "Review comment must be 400 characters or fewer." };
  }
  const tags = (input.tags ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 4);
  return { ok: true, rating, comment, tags };
}
