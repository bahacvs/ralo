// Club reviews (/api/clubs/:id/reviews).

export interface ClubReview {
  id: string;
  rating: number; // 1-5
  comment: string | null;
  userId: string;
  userMaskedName: string;
  userAvatar: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClubReviewsResponse {
  summary: { average: number | null; count: number; distribution: Record<1 | 2 | 3 | 4 | 5, number> };
  reviews: ClubReview[];
  /** Signed-in viewers only: whether they may review (played at the club) and their existing review. */
  viewer: { canReview: boolean; myReview: ClubReview | null } | null;
}
