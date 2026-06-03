# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import json


class Genazo(gl.Contract):

    players: str
    fingerprints: str
    daily_riddle: str
    daily_day_number: str
    daily_answers: str
    all_time_leaderboard: str
    weekly_leaderboard: str

    def __init__(self):
        self.players = json.dumps({})
        self.fingerprints = json.dumps({})
        self.daily_riddle = ""
        self.daily_day_number = json.dumps(0)
        self.daily_answers = json.dumps({})
        self.all_time_leaderboard = json.dumps([])
        self.weekly_leaderboard = json.dumps([])

    @gl.public.write
    def register_player(self, session_id: str, username: str):
        players = json.loads(self.players)
        if session_id in players:
            return json.dumps({"error": "already_registered"})
        username = username.strip()
        if len(username) < 3 or len(username) > 20:
            return json.dumps({"error": "invalid_username"})
        for sid, data in players.items():
            if data.get("username", "").lower() == username.lower():
                return json.dumps({"error": "username_taken"})
        players[session_id] = {
            "username": username,
            "total_points": 0,
            "streak": 0,
            "longest_streak": 0,
            "days_answered": 0,
            "days_correct": 0,
            "last_day_answered": 0,
        }
        self.players = json.dumps(players)
        return json.dumps({"success": True, "username": username})

    @gl.public.write
    def generate_daily_riddle(self, session_id: str, docs_url: str):
        day = json.loads(self.daily_day_number)
        day += 1
        self.daily_day_number = json.dumps(day)

        TOPICS = [
            "Optimistic Democracy",
            "Validators and how they work",
            "Equivalence Principle",
            "GenVM execution environment",
            "Intelligent Contracts",
            "Appeal Process",
            "Non-deterministic operations",
            "Finality and transaction lifecycle",
            "GenLayer founding and mission",
            "Testnet Asimov and Bradbury history",
            "Builder Program and incentives",
            "GEN token and staking economics",
            "Partnerships and ecosystem",
            "LayerZero integration",
            "Community and culture",
        ]
        topic = TOPICS[(day - 1) % len(TOPICS)]

        def fetch() -> str:
            raw = gl.nondet.web.render(
                docs_url, mode="text"
            )
            if not raw:
                raise Exception("empty")
            return raw[:1500]

        docs = gl.eq_principle.prompt_comparative(
            fetch,
            "Both outputs equivalent if they contain the same GenLayer documentation content"
        )

        fingerprints = json.loads(self.fingerprints)
        used = list(fingerprints.keys())

        recent_concepts = list(set([
            fp.split(":")[0]
            for fp in used[-10:]
            if ":" in fp
        ]))

        def generate() -> str:
            prompt = f"""You are a riddle master for Genazo,
the daily GenLayer knowledge game.

GenLayer content:
{docs}

TODAY'S TOPIC: {topic}
You MUST generate a riddle specifically
about: {topic}
Do not deviate to other topics.

BANNED CONCEPTS from recent riddles:
{json.dumps(recent_concepts)}

Used fingerprints — use completely
different angle from these:
{json.dumps(used[:20])}

Generate ONE riddle for Day {day}
about {topic}.

LENGTH RULES:
- Riddle: 3 to 4 sentences maximum
- Hint: 1 sentence only
- Options: natural GenLayer terminology
- Explanation: 2 to 3 sentences maximum

DIFFICULTY — make it genuinely tricky:
- Never mention the answer word directly
- Use metaphors and indirect references
- All 4 options must sound equally plausible
- No obviously wrong answers
- All options from same concept family

STYLE:
- Short punchy sentences
- NYT Wordle level of elegance
- Mysterious and clever not academic

STRUCTURE:
Sentence 1: Set the scene
Sentence 2: One indirect clue
Sentence 3: Second indirect clue
Sentence 4: End with "What am I?"

Return ONLY valid JSON:
{{
    "riddle": "3 to 4 sentence riddle",
    "hint": "one sentence subtle clue",
    "options": {{
        "A": "option",
        "B": "option",
        "C": "option",
        "D": "option"
    }},
    "correct": "A",
    "explanation": "2 to 3 sentences",
    "fingerprint": "{topic}:unique_angle",
    "day": {day},
    "topic": "{topic}",
    "category": "community or technical"
}}"""
            return gl.nondet.exec_prompt(prompt)

        result = gl.eq_principle.prompt_comparative(
            generate,
            f"Both outputs are equivalent if they are both valid JSON riddles specifically about {topic} in the GenLayer ecosystem, even if the riddle text, hint wording, options, and explanation differ completely between the two outputs"
        )

        try:
            clean = result.strip()
            if "```json" in clean:
                clean = clean.split("```json")[1].split("```")[0].strip()
            elif "```" in clean:
                clean = clean.split("```")[1].split("```")[0].strip()

            riddle = json.loads(clean)

            fp = riddle.get("fingerprint", "")
            if fp:
                fingerprints[fp] = True
                self.fingerprints = json.dumps(fingerprints)

            self.daily_riddle = json.dumps(riddle)
            self.daily_answers = json.dumps({})

            if day % 7 == 0:
                self.weekly_leaderboard = json.dumps([])

            return json.dumps({"success": True, "day": day})

        except Exception as e:
            return json.dumps({"error": str(e)[:100]})

    @gl.public.write
    def submit_daily_answer(self, session_id: str, username: str, answer: str):
        if not self.daily_riddle:
            return json.dumps({"error": "no_riddle_today"})

        current_day = json.loads(self.daily_day_number)
        answers = json.loads(self.daily_answers)

        if session_id in answers:
            return json.dumps({"error": "already_answered"})

        players = json.loads(self.players)
        if session_id not in players:
            players[session_id] = {
                "username": username,
                "total_points": 0,
                "streak": 0,
                "longest_streak": 0,
                "days_answered": 0,
                "days_correct": 0,
                "last_day_answered": 0,
            }

        player = players[session_id]
        last_day = player.get("last_day_answered", 0)

        if last_day == current_day - 1:
            new_streak = player.get("streak", 0) + 1
        else:
            new_streak = 1

        riddle = json.loads(self.daily_riddle)
        correct = riddle.get("correct", "A").upper()
        is_correct = answer.upper() == correct

        streak_bonus = 0
        if is_correct:
            if new_streak >= 30:
                streak_bonus = 100
            elif new_streak >= 7:
                streak_bonus = 50
            elif new_streak >= 3:
                streak_bonus = 25

        points = (100 + streak_bonus) if is_correct else 0

        player["total_points"] = player.get("total_points", 0) + points
        player["streak"] = new_streak if is_correct else 0
        player["longest_streak"] = max(
            player.get("longest_streak", 0), new_streak
        )
        player["days_answered"] = player.get("days_answered", 0) + 1
        if is_correct:
            player["days_correct"] = player.get("days_correct", 0) + 1
        player["last_day_answered"] = current_day
        player["username"] = username

        players[session_id] = player
        self.players = json.dumps(players)

        answers[session_id] = {
            "username": username,
            "answer": answer.upper(),
            "correct": is_correct,
            "points": points,
            "streak": new_streak if is_correct else 0,
        }
        self.daily_answers = json.dumps(answers)

        all_time = json.loads(self.all_time_leaderboard)
        found = False
        for entry in all_time:
            if entry.get("session_id") == session_id:
                entry["total_points"] = player["total_points"]
                entry["streak"] = player["streak"]
                entry["days_answered"] = player["days_answered"]
                entry["username"] = username
                found = True
                break
        if not found:
            all_time.append({
                "session_id": session_id,
                "username": username,
                "total_points": points,
                "streak": new_streak if is_correct else 0,
                "days_answered": 1,
            })
        all_time.sort(key=lambda x: x.get("total_points", 0), reverse=True)
        self.all_time_leaderboard = json.dumps(all_time[:100])

        weekly = json.loads(self.weekly_leaderboard)
        found_w = False
        for entry in weekly:
            if entry.get("session_id") == session_id:
                entry["points"] = entry.get("points", 0) + points
                entry["username"] = username
                found_w = True
                break
        if not found_w:
            weekly.append({
                "session_id": session_id,
                "username": username,
                "points": points,
            })
        weekly.sort(key=lambda x: x.get("points", 0), reverse=True)
        self.weekly_leaderboard = json.dumps(weekly[:100])

        return json.dumps({
            "success": True,
            "correct": is_correct,
            "points": points,
            "streak_bonus": streak_bonus,
            "new_streak": new_streak if is_correct else 0,
            "correct_answer": correct,
            "explanation": riddle.get("explanation", ""),
        })

    @gl.public.view
    def get_daily_riddle(self) -> str:
        if not self.daily_riddle:
            return json.dumps({"found": False})
        riddle = json.loads(self.daily_riddle)
        day = json.loads(self.daily_day_number)
        answers = json.loads(self.daily_answers)
        return json.dumps({
            "found": True,
            "riddle": riddle,
            "day": day,
            "total_answers": len(answers),
        })

    @gl.public.view
    def get_daily_answers(self) -> str:
        answers = json.loads(self.daily_answers)
        result = []
        for sid, data in answers.items():
            result.append(data)
        result.sort(key=lambda x: x.get("points", 0), reverse=True)
        return json.dumps(result)

    @gl.public.view
    def get_all_time_leaderboard(self) -> str:
        return self.all_time_leaderboard

    @gl.public.view
    def get_weekly_leaderboard(self) -> str:
        return self.weekly_leaderboard

    @gl.public.view
    def get_player(self, session_id: str) -> str:
        players = json.loads(self.players)
        if session_id not in players:
            return json.dumps({"found": False})
        return json.dumps({
            "found": True,
            "player": players[session_id]
        })

    @gl.public.view
    def get_day_number(self) -> str:
        return self.daily_day_number
