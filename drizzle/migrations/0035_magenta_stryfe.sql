CREATE TABLE `friendships` (
	`user_id` text NOT NULL,
	`friend_id` text NOT NULL,
	`requested_by` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`user_id`, `friend_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`friend_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "friendships_ordered_pair" CHECK("friendships"."user_id" < "friendships"."friend_id"),
	CONSTRAINT "friendships_requester_is_member" CHECK("friendships"."requested_by" IN ("friendships"."user_id", "friendships"."friend_id")),
	CONSTRAINT "friendships_valid_status" CHECK("friendships"."status" IN ('pending', 'accepted'))
);
--> statement-breakpoint
CREATE INDEX `friendships_friend_idx` ON `friendships` (`friend_id`);