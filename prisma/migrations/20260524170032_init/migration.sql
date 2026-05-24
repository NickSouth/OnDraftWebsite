-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified_at" TIMESTAMP(3),
    "display_name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "theme" TEXT NOT NULL DEFAULT 'light',
    "font_size" TEXT NOT NULL DEFAULT 'small',
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_bans" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "banned_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3),
    "banned_by_user_id" TEXT NOT NULL,
    "lifted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_bans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mailing_list_subscriptions" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "user_id" TEXT,
    "status" TEXT NOT NULL,
    "consent_source" TEXT NOT NULL,
    "consent_text_version" TEXT NOT NULL,
    "consented_at" TIMESTAMP(3),
    "unsubscribed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mailing_list_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "browser_sessions" (
    "id" TEXT NOT NULL,
    "data" TEXT NOT NULL DEFAULT '{}',
    "browser_id" TEXT NOT NULL,
    "browser_label" TEXT NOT NULL,
    "visit_count" INTEGER NOT NULL DEFAULT 0,
    "authenticated_user_id" TEXT,
    "signed_in_at" TIMESTAMP(3),
    "remember_me" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "browser_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookmarks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "article_id" TEXT,
    "forum_post_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articles" (
    "id" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "writeup" TEXT NOT NULL,
    "publication_date" TIMESTAMP(3) NOT NULL,
    "content_type" TEXT NOT NULL,
    "plain_text" TEXT,
    "html_body" TEXT,
    "pdf_url" TEXT,
    "pdf_original_name" TEXT,
    "pdf_mime_type" TEXT,
    "pdf_size" INTEGER,
    "image_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_tags" (
    "article_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,

    CONSTRAINT "article_tags_pkey" PRIMARY KEY ("article_id","tag_id")
);

-- CreateTable
CREATE TABLE "article_likes" (
    "article_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_likes_pkey" PRIMARY KEY ("article_id","actor_id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "article_id" TEXT NOT NULL,
    "parent_comment_id" TEXT,
    "user_id" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comment_likes" (
    "comment_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_likes_pkey" PRIMARY KEY ("comment_id","actor_id")
);

-- CreateTable
CREATE TABLE "forum_posts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "forum_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forum_post_comments" (
    "id" TEXT NOT NULL,
    "forum_post_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "forum_post_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forum_post_likes" (
    "forum_post_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "forum_post_likes_pkey" PRIMARY KEY ("forum_post_id","actor_id")
);

-- CreateTable
CREATE TABLE "videos" (
    "video_id" TEXT NOT NULL,
    "youtube_url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "thumbnail_url" TEXT,
    "view_count" INTEGER,
    "youtube_stats_fetched_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "videos_pkey" PRIMARY KEY ("video_id")
);

-- CreateTable
CREATE TABLE "video_tags" (
    "video_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,

    CONSTRAINT "video_tags_pkey" PRIMARY KEY ("video_id","tag_id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "big_boards" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "creator" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "big_boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "big_board_entries" (
    "id" TEXT NOT NULL,
    "big_board_id" TEXT NOT NULL,
    "player_name" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "school" TEXT NOT NULL,
    "rank" INTEGER,
    "pos_rank" INTEGER,
    "height_feet" INTEGER,
    "height_inches" INTEGER,
    "weight" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "strengths" TEXT NOT NULL DEFAULT '',
    "weaknesses" TEXT NOT NULL DEFAULT '',
    "rundown" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "player_info_published" BOOLEAN NOT NULL DEFAULT false,
    "writeup_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "big_board_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "user_bans_user_id_idx" ON "user_bans"("user_id");

-- CreateIndex
CREATE INDEX "user_bans_banned_by_user_id_idx" ON "user_bans"("banned_by_user_id");

-- CreateIndex
CREATE INDEX "user_bans_expires_at_idx" ON "user_bans"("expires_at");

-- CreateIndex
CREATE INDEX "user_bans_lifted_at_idx" ON "user_bans"("lifted_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_token_hash_key" ON "email_verification_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "email_verification_tokens_user_id_idx" ON "email_verification_tokens"("user_id");

-- CreateIndex
CREATE INDEX "email_verification_tokens_expires_at_idx" ON "email_verification_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "email_verification_tokens_used_at_idx" ON "email_verification_tokens"("used_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "password_reset_tokens_used_at_idx" ON "password_reset_tokens"("used_at");

-- CreateIndex
CREATE UNIQUE INDEX "mailing_list_subscriptions_email_key" ON "mailing_list_subscriptions"("email");

-- CreateIndex
CREATE UNIQUE INDEX "mailing_list_subscriptions_user_id_key" ON "mailing_list_subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "mailing_list_subscriptions_status_idx" ON "mailing_list_subscriptions"("status");

-- CreateIndex
CREATE INDEX "mailing_list_subscriptions_updated_at_idx" ON "mailing_list_subscriptions"("updated_at");

-- CreateIndex
CREATE INDEX "browser_sessions_browser_id_idx" ON "browser_sessions"("browser_id");

-- CreateIndex
CREATE INDEX "browser_sessions_authenticated_user_id_idx" ON "browser_sessions"("authenticated_user_id");

-- CreateIndex
CREATE INDEX "browser_sessions_expires_at_idx" ON "browser_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "bookmarks_user_id_idx" ON "bookmarks"("user_id");

-- CreateIndex
CREATE INDEX "bookmarks_type_idx" ON "bookmarks"("type");

-- CreateIndex
CREATE UNIQUE INDEX "bookmarks_user_id_article_id_key" ON "bookmarks"("user_id", "article_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookmarks_user_id_forum_post_id_key" ON "bookmarks"("user_id", "forum_post_id");

-- CreateIndex
CREATE INDEX "articles_published_idx" ON "articles"("published");

-- CreateIndex
CREATE INDEX "articles_publication_date_idx" ON "articles"("publication_date");

-- CreateIndex
CREATE INDEX "articles_author_idx" ON "articles"("author");

-- CreateIndex
CREATE INDEX "article_tags_tag_id_idx" ON "article_tags"("tag_id");

-- CreateIndex
CREATE INDEX "article_likes_actor_id_idx" ON "article_likes"("actor_id");

-- CreateIndex
CREATE INDEX "comments_article_id_idx" ON "comments"("article_id");

-- CreateIndex
CREATE INDEX "comments_parent_comment_id_idx" ON "comments"("parent_comment_id");

-- CreateIndex
CREATE INDEX "comments_user_id_idx" ON "comments"("user_id");

-- CreateIndex
CREATE INDEX "comments_created_at_idx" ON "comments"("created_at");

-- CreateIndex
CREATE INDEX "comment_likes_actor_id_idx" ON "comment_likes"("actor_id");

-- CreateIndex
CREATE INDEX "forum_posts_user_id_idx" ON "forum_posts"("user_id");

-- CreateIndex
CREATE INDEX "forum_posts_created_at_idx" ON "forum_posts"("created_at");

-- CreateIndex
CREATE INDEX "forum_post_comments_forum_post_id_idx" ON "forum_post_comments"("forum_post_id");

-- CreateIndex
CREATE INDEX "forum_post_comments_user_id_idx" ON "forum_post_comments"("user_id");

-- CreateIndex
CREATE INDEX "forum_post_comments_created_at_idx" ON "forum_post_comments"("created_at");

-- CreateIndex
CREATE INDEX "forum_post_likes_actor_id_idx" ON "forum_post_likes"("actor_id");

-- CreateIndex
CREATE INDEX "videos_created_at_idx" ON "videos"("created_at");

-- CreateIndex
CREATE INDEX "videos_view_count_idx" ON "videos"("view_count");

-- CreateIndex
CREATE INDEX "video_tags_tag_id_idx" ON "video_tags"("tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE INDEX "big_boards_year_idx" ON "big_boards"("year");

-- CreateIndex
CREATE INDEX "big_boards_creator_idx" ON "big_boards"("creator");

-- CreateIndex
CREATE UNIQUE INDEX "big_boards_year_creator_key" ON "big_boards"("year", "creator");

-- CreateIndex
CREATE INDEX "big_board_entries_big_board_id_idx" ON "big_board_entries"("big_board_id");

-- CreateIndex
CREATE INDEX "big_board_entries_school_idx" ON "big_board_entries"("school");

-- CreateIndex
CREATE INDEX "big_board_entries_position_idx" ON "big_board_entries"("position");

-- CreateIndex
CREATE INDEX "big_board_entries_rank_idx" ON "big_board_entries"("rank");

-- CreateIndex
CREATE INDEX "big_board_entries_sort_order_idx" ON "big_board_entries"("sort_order");

-- CreateIndex
CREATE INDEX "big_board_entries_pos_rank_idx" ON "big_board_entries"("pos_rank");

-- CreateIndex
CREATE INDEX "big_board_entries_player_info_published_idx" ON "big_board_entries"("player_info_published");

-- CreateIndex
CREATE INDEX "big_board_entries_writeup_published_idx" ON "big_board_entries"("writeup_published");

-- CreateIndex
CREATE UNIQUE INDEX "big_board_entries_big_board_id_id_key" ON "big_board_entries"("big_board_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "big_board_entries_big_board_id_player_name_key" ON "big_board_entries"("big_board_id", "player_name");

-- AddForeignKey
ALTER TABLE "user_bans" ADD CONSTRAINT "user_bans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mailing_list_subscriptions" ADD CONSTRAINT "mailing_list_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "browser_sessions" ADD CONSTRAINT "browser_sessions_authenticated_user_id_fkey" FOREIGN KEY ("authenticated_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_forum_post_id_fkey" FOREIGN KEY ("forum_post_id") REFERENCES "forum_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_tags" ADD CONSTRAINT "article_tags_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_tags" ADD CONSTRAINT "article_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_likes" ADD CONSTRAINT "article_likes_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_likes" ADD CONSTRAINT "comment_likes_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forum_post_comments" ADD CONSTRAINT "forum_post_comments_forum_post_id_fkey" FOREIGN KEY ("forum_post_id") REFERENCES "forum_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forum_post_comments" ADD CONSTRAINT "forum_post_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forum_post_likes" ADD CONSTRAINT "forum_post_likes_forum_post_id_fkey" FOREIGN KEY ("forum_post_id") REFERENCES "forum_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_tags" ADD CONSTRAINT "video_tags_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("video_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_tags" ADD CONSTRAINT "video_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "big_board_entries" ADD CONSTRAINT "big_board_entries_big_board_id_fkey" FOREIGN KEY ("big_board_id") REFERENCES "big_boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
