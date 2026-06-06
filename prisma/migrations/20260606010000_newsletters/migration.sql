CREATE TABLE "newsletters" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "writeup" TEXT NOT NULL,
    "article_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "video_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "changelog" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "newsletters_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "newsletters_status_idx" ON "newsletters"("status");
CREATE INDEX "newsletters_date_idx" ON "newsletters"("date");
CREATE INDEX "newsletters_updated_at_idx" ON "newsletters"("updated_at");
