const CANDIDATES = {
  president: ["Erick", "Sariya"],
  vice_president: ["Axel W", "Nkhai", "Marquell", "Angel", "Nathaniel"],
  sheriff: ["Dennis", "Franclin", "Jose", "Malaiyah", "Esmay", "Dylan R", "Axel V", "Rey"],
  judge: ["Victor", "Dylan V", "Omar", "Mecca", "Kevin", "Neveah", "Esmeralda", "Itzel"]
};

const ALLOWED_RACES = Object.keys(CANDIDATES);
const MAX_VOTES_PER_CANDIDATE = 35;
const MAX_VOTERS = 100;

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
  return candidate === null || CANDIDATES[race].includes(candidate);
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
        counts[race][candidate]++;
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
                judge: ballot.judge
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

        const oldChoices = oldBallot || {
          president: null,
          vice_president: null,
          sheriff: null,
          judge: null
        };

        const results = await getResults(env.DB);

        const newCounts = structuredClone(results.counts);

        for (const race of ALLOWED_RACES) {
          const oldCandidate = oldChoices[race];
          const newCandidate = choices[race] ?? null;

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
              choices.president ?? null,
              choices.vice_president ?? null,
              choices.sheriff ?? null,
              choices.judge ?? null,
              new Date().toISOString()
            )
            .run();
        }

        return response({
          success: true,
          voters: voterCount,
          choices: {
            president: choices.president ?? null,
            vice_president: choices.vice_president ?? null,
            sheriff: choices.sheriff ?? null,
            judge: choices.judge ?? null
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
