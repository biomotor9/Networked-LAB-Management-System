ALTER TABLE "questions" ADD COLUMN "answer_outcome" text DEFAULT '待回填' NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "answer_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
WITH "legacy_answers" AS (
	SELECT
		"question_key",
		CASE
			WHEN bool_or("outcome" = '待回填') THEN '待回填'
			WHEN count(DISTINCT "outcome") = 1 THEN min("outcome")
			ELSE '不确定'
		END AS "answer_outcome",
		COALESCE(string_agg(NULLIF("note", ''), E'\n\n' ORDER BY "created_at") FILTER (WHERE "note" <> ''), '') AS "answer_note"
	FROM "question_experiment_links"
	GROUP BY "question_key"
)
UPDATE "questions"
SET
	"answer_outcome" = "legacy_answers"."answer_outcome",
	"answer_note" = "legacy_answers"."answer_note"
FROM "legacy_answers"
WHERE "questions"."key" = "legacy_answers"."question_key";
