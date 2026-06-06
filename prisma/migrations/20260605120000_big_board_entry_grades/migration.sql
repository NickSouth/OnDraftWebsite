ALTER TABLE "big_board_entries"
  ADD COLUMN "grade" JSONB,
  ADD COLUMN "grade_published" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "big_board_entries_grade_published_idx" ON "big_board_entries"("grade_published");
