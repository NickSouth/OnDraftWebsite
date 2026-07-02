-- CreateTable
CREATE TABLE "page_views" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "browser_id" TEXT NOT NULL,
    "referrer_host" TEXT,
    "user_agent" TEXT,
    "device_type" TEXT NOT NULL DEFAULT 'desktop',
    "authenticated" BOOLEAN NOT NULL DEFAULT false,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "is_bot" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "page_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "page_views_occurred_at_idx" ON "page_views"("occurred_at");

-- CreateIndex
CREATE INDEX "page_views_path_idx" ON "page_views"("path");

-- CreateIndex
CREATE INDEX "page_views_browser_id_occurred_at_idx" ON "page_views"("browser_id", "occurred_at");
