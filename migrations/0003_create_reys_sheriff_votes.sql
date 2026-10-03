CREATE TABLE IF NOT EXISTS reys_sheriff_votes (
  voter_id TEXT PRIMARY KEY,
  candidate TEXT NOT NULL CHECK (candidate IN ('Rey', 'Dennis')),
  cast_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS reys_sheriff_votes_candidate_idx
  ON reys_sheriff_votes(candidate);

CREATE TRIGGER IF NOT EXISTS reys_sheriff_candidate_limit
BEFORE INSERT ON reys_sheriff_votes
WHEN (
  SELECT COUNT(*)
  FROM reys_sheriff_votes
  WHERE candidate = NEW.candidate
) >= 35
BEGIN
  SELECT RAISE(ABORT, 'candidate_full');
END;
