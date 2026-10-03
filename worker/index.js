const CANDIDATES = {
  president: ["Erick", "Sariya"],
  vice_president: ["Axel W", "Nkhai", "Marquell", "Angel", "Nathaniel"],
  sheriff: ["Dennis", "Franclin", "Jose", "Malaiyah", "Esmay", "Dylan R", "Axel V", "Rey"],
  judge: ["Victor", "Dylan V", "Omar", "Mecca", "Kevin", "Neveah", "Esmeralda", "Itzel"]
};

const ALLOWED_RACES = Object.keys(CANDIDATES);
const MAX_VOTES_PER_CANDIDATE = 35;
const MAX_VOTERS = 100;
const REYS_CANDIDATES = ["Rey", "Dennis"];
const REYS_MAX_VOTES_PER_CANDIDATE = 35;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders()
    }
  });
}

function validChoice(race, candidate) {
  return candidate === null || CANDIDATES[race].includes(candidate) || (race === "judge" && candidate === "Jamaiya");
}

function canonicalCandidate(race, candidate) {
  return race === "judge" && candidate === "Jamaiya" ? "Mecca" : candidate;
}

function storageCandidate(race, candidate, databaseSupportsMecca) {
  const canonical = canonicalCandidate(race, candidate);
  return race === "judge" && canonical === "Mecca" && !databaseSupportsMecca ? "Jamaiya" : canonical;
}

async function databaseSupportsMecca(db) {
  const schema = await db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'ballots'")
    .first();
  return String(schema?.sql || "").includes("'Mecca'");
}

async function getBallot(db, voterId) {
  return await db
    .prepare("SELECT * FROM ballots WHERE voter_id = ?")
    .bind(voterId)
    .first();
}

async function getResults(db) {
  const rows = await db
    .prepare("SELECT president, vice_president, sheriff, judge FROM ballots")
    .all();

  const counts = {
    president: {},
    vice_president: {},
    sheriff: {},
    judge: {}
  };

  for (const race of ALLOWED_RACES) {
    for (const candidate of CANDIDATES[race]) {
      counts[race][candidate] = 0;
    }
  }

  let voters = 0;

  for (const row of rows.results || []) {
    let hasVote = false;

    for (const race of ALLOWED_RACES) {
      const candidate = row[race];

      if (candidate) {
        const resultCandidate = canonicalCandidate(race, candidate);
        if (counts[race][resultCandidate] !== undefined) counts[race][resultCandidate]++;
        hasVote = true;
      }
    }

    if (hasVote) voters++;
  }

  return {
    voters,
    maxVoters: MAX_VOTERS,
    maxVotesPerCandidate: MAX_VOTES_PER_CANDIDATE,
    counts
  };
}

async function getReysResults(db) {
  const rows = await db
    .prepare("SELECT candidate, COUNT(*) AS votes FROM reys_sheriff_votes GROUP BY candidate")
    .all();

  const counts = { Rey: 0, Dennis: 0 };
  for (const row of rows.results || []) {
    if (Object.prototype.hasOwnProperty.call(counts, row.candidate)) {
      counts[row.candidate] = Number(row.votes) || 0;
    }
  }

  return {
    voters: counts.Rey + counts.Dennis,
    maxVoters: REYS_MAX_VOTES_PER_CANDIDATE * REYS_CANDIDATES.length,
    maxVotesPerCandidate: REYS_MAX_VOTES_PER_CANDIDATE,
    counts
  };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    const url = new URL(request.url);

    try {
      if (request.method === "GET" && url.pathname === "/api/reys-election/results") {
        return response(await getReysResults(env.DB));
      }

      if (request.method === "GET" && url.pathname === "/api/reys-election/ballot") {
        const voterId = (url.searchParams.get("voterId") || "").trim();
        if (voterId.length < 8 || voterId.length > 100) {
          return response({ error: "Invalid voterId" }, 400);
        }

        const ballot = await env.DB
          .prepare("SELECT candidate FROM reys_sheriff_votes WHERE voter_id = ?")
          .bind(voterId)
          .first();

        return response({ hasVoted: Boolean(ballot), candidate: ballot?.candidate || null });
      }

      if (request.method === "POST" && url.pathname === "/api/reys-election/vote") {
        const body = await request.json();
        const voterId = String(body.voterId || "").trim();
        const candidate = String(body.candidate || "").trim();

        if (voterId.length < 8 || voterId.length > 100) {
          return response({ error: "Invalid voterId" }, 400);
        }
        if (!REYS_CANDIDATES.includes(candidate)) {
          return response({ status: "invalid_candidate" }, 400);
        }

        try {
          const inserted = await env.DB
            .prepare("INSERT OR IGNORE INTO reys_sheriff_votes (voter_id, candidate, cast_at) VALUES (?, ?, ?)")
            .bind(voterId, candidate, new Date().toISOString())
            .run();

          if (!inserted.meta?.changes) {
            return response({ status: "already_voted", counts: (await getReysResults(env.DB)).counts }, 409);
          }
        } catch (error) {
          if (String(error.message || error).includes("candidate_full")) {
            return response({ status: "candidate_full", counts: (await getReysResults(env.DB)).counts }, 409);
          }
          throw error;
        }

        return response({ status: "success", counts: (await getReysResults(env.DB)).counts });
      }

      if (request.method === "GET" && url.pathname === "/api/results") {
        return response(await getResults(env.DB));
      }

      if (request.method === "GET" && url.pathname === "/api/ballot") {
        const voterId = url.searchParams.get("voterId");

        if (!voterId) {
          return response({ error: "Missing voterId" }, 400);
        }

        const ballot = await getBallot(env.DB, voterId);

        return response({
          voterId,
          choices: ballot
            ? {
                president: ballot.president,
                vice_president: ballot.vice_president,
                sheriff: ballot.sheriff,
                judge: canonicalCandidate("judge", ballot.judge)
              }
            : {
                president: null,
                vice_president: null,
                sheriff: null,
                judge: null
              }
        });
      }

      if (request.method === "POST" && url.pathname === "/api/ballot") {
        const body = await request.json();

        const voterId = String(body.voterId || "").trim();
        const choices = body.choices || {};

        if (!voterId) {
          return response({ error: "Missing voterId" }, 400);
        }

        for (const race of ALLOWED_RACES) {
          if (!validChoice(race, choices[race] ?? null)) {
            return response({
              error: `Invalid candidate for ${race}`
            }, 400);
          }
        }

        const oldBallot = await getBallot(env.DB, voterId);
        const databaseHasMecca = await databaseSupportsMecca(env.DB);

        const oldChoices = oldBallot || {
          president: null,
          vice_president: null,
          sheriff: null,
          judge: null
        };

        const results = await getResults(env.DB);

        const newCounts = structuredClone(results.counts);

        for (const race of ALLOWED_RACES) {
          const oldCandidate = canonicalCandidate(race, oldChoices[race]);
          const newCandidate = canonicalCandidate(race, choices[race] ?? null);

          if (oldCandidate) {
            newCounts[race][oldCandidate]--;
          }

          if (newCandidate) {
            newCounts[race][newCandidate]++;
          }
        }

        for (const race of ALLOWED_RACES) {
          for (const candidate of CANDIDATES[race]) {
            if (newCounts[race][candidate] > MAX_VOTES_PER_CANDIDATE) {
              return response({
                error: `${candidate} has reached the 35-vote limit.`
              }, 409);
            }
          }
        }

        const oldHasVote = ALLOWED_RACES.some(race => oldChoices[race]);
        const newHasVote = ALLOWED_RACES.some(
          race => choices[race] ?? null
        );

        let voterCount = results.voters;

        if (!oldHasVote && newHasVote) {
          voterCount++;
        }

        if (oldHasVote && !newHasVote) {
          voterCount--;
        }

        if (voterCount > MAX_VOTERS) {
          return response({
            error: "The election has reached the 100-voter limit."
          }, 409);
        }

        if (!newHasVote) {
          await env.DB
            .prepare("DELETE FROM ballots WHERE voter_id = ?")
            .bind(voterId)
            .run();
        } else {
          await env.DB
            .prepare(`
              INSERT INTO ballots
                (voter_id, president, vice_president, sheriff, judge, updated_at)
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(voter_id) DO UPDATE SET
                president = excluded.president,
                vice_president = excluded.vice_president,
                sheriff = excluded.sheriff,
                judge = excluded.judge,
                updated_at = excluded.updated_at
            `)
            .bind(
              voterId,
              storageCandidate("president", choices.president ?? null, databaseHasMecca),
              storageCandidate("vice_president", choices.vice_president ?? null, databaseHasMecca),
              storageCandidate("sheriff", choices.sheriff ?? null, databaseHasMecca),
              storageCandidate("judge", choices.judge ?? null, databaseHasMecca),
              new Date().toISOString()
            )
            .run();
        }

        return response({
          success: true,
          voters: voterCount,
          choices: {
            president: canonicalCandidate("president", choices.president ?? null),
            vice_president: canonicalCandidate("vice_president", choices.vice_president ?? null),
            sheriff: canonicalCandidate("sheriff", choices.sheriff ?? null),
            judge: canonicalCandidate("judge", choices.judge ?? null)
          }
        });
      }

      return response({
        error: "Not found"
      }, 404);

    } catch (error) {
      return response({
        error: error.message || "Server error"
      }, 500);
    }
  }
};
