-- Rename the candidate while preserving every existing ballot and vote count.
CREATE TABLE ballots_new (
  voter_id TEXT PRIMARY KEY,
  president TEXT CHECK (president IS NULL OR president IN ('Erick', 'Sariya')),
  vice_president TEXT CHECK (vice_president IS NULL OR vice_president IN ('Axel W', 'Nkhai', 'Marquell', 'Angel', 'Nathaniel')),
  sheriff TEXT CHECK (sheriff IS NULL OR sheriff IN ('Dennis', 'Franclin', 'Jose', 'Malaiyah', 'Esmay', 'Dylan R', 'Axel V', 'Rey')),
  judge TEXT CHECK (judge IS NULL OR judge IN ('Victor', 'Dylan V', 'Omar', 'Mecca', 'Kevin', 'Neveah', 'Esmeralda', 'Itzel')),
  updated_at TEXT NOT NULL
);

INSERT INTO ballots_new (voter_id, president, vice_president, sheriff, judge, updated_at)
SELECT voter_id, president, vice_president, sheriff,
       CASE WHEN judge = 'Jamaiya' THEN 'Mecca' ELSE judge END,
       updated_at
FROM ballots;

DROP TABLE ballots;
ALTER TABLE ballots_new RENAME TO ballots;
CREATE INDEX ballots_updated_at_idx ON ballots(updated_at);
