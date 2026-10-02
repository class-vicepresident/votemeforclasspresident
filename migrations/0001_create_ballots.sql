CREATE TABLE IF NOT EXISTS ballots (
  voter_id TEXT PRIMARY KEY,
  president TEXT CHECK (president IS NULL OR president IN ('Erick', 'Sariya')),
  vice_president TEXT CHECK (vice_president IS NULL OR vice_president IN ('Axel W', 'Nkhai', 'Marquell', 'Angel', 'Nathaniel')),
  sheriff TEXT CHECK (sheriff IS NULL OR sheriff IN ('Dennis', 'Franclin', 'Jose', 'Malaiyah', 'Esmay', 'Dylan R', 'Axel V', 'Rey')),
  judge TEXT CHECK (judge IS NULL OR judge IN ('Victor', 'Dylan V', 'Omar', 'Jamaiya', 'Kevin', 'Neveah', 'Esmeralda', 'Itzel')),
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ballots_updated_at_idx ON ballots(updated_at);
