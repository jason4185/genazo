# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import json


class Genazo(gl.Contract):

    players: str
    fingerprints: str
    daily_riddles: str
    daily_day_number: str
    daily_answers: str
    all_time_leaderboard: str
    weekly_leaderboard: str
    generation_complete: str

    def __init__(self):
        self.players = json.dumps({})
        self.fingerprints = json.dumps({})
        self.daily_riddles = json.dumps([])
        self.daily_day_number = json.dumps(0)
        self.daily_answers = json.dumps({})
        self.all_time_leaderboard = json.dumps([])
        self.weekly_leaderboard = json.dumps([])
        self.generation_complete = json.dumps(False)

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
    def generate_daily_riddle(self, session_id: str, docs_url: str, riddle_number: int):
        current_day = json.loads(self.daily_day_number)

        if riddle_number == 1:
            day = current_day + 1
            self.daily_day_number = json.dumps(day)
            self.daily_answers = json.dumps({})
            self.daily_riddles = json.dumps([])
            self.generation_complete = json.dumps(False)
            if day % 7 == 0:
                self.weekly_leaderboard = json.dumps([])
        else:
            day = current_day

        riddles = json.loads(self.daily_riddles)

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

        i = riddle_number - 1
        topic_index = (day - 1 + i) % len(TOPICS)
        topic = TOPICS[topic_index]

        used_fps = list(fingerprints.keys())

        def generate() -> str:
            prompt = f"""You are a riddle master for Genazo, the daily GenLayer knowledge game.

GenLayer content:
{docs}

TODAY'S TOPIC: {topic}
You MUST generate a riddle specifically about: {topic}
Do not deviate to other topics.

BANNED CONCEPTS from recent riddles:
{json.dumps(recent_concepts)}

Used fingerprints — use completely different angle from these:
{json.dumps(used_fps[:20])}

Generate ONE riddle for Day {day} Riddle {riddle_number} of 5.

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
    "correct": "A or B or C or D",
    "explanation": "2 to 3 sentences",
    "fingerprint": "{topic}:unique_angle",
    "day": {day},
    "riddle_number": {riddle_number},
    "topic": "{topic}",
    "category": "community or technical"
}}"""
            return gl.nondet.exec_prompt(prompt)

        result = gl.eq_principle.prompt_comparative(
            generate,
            f"Both outputs are equivalent if they are both valid JSON riddles specifically about {topic} in the GenLayer ecosystem, even if the riddle text, hint wording, options, and explanation differ completely"
        )

        def shuffle_options(riddle, day, riddle_number):
            options = riddle.get('options', {})
            correct_letter = riddle.get('correct', 'A').upper()

            if not options or correct_letter not in options:
                return riddle

            correct_answer = options[correct_letter]

            all_options = [
                options.get('A', ''),
                options.get('B', ''),
                options.get('C', ''),
                options.get('D', ''),
            ]

            seed = (day * 7 + riddle_number * 13) % 24

            permutations = [
                [0,1,2,3],[0,1,3,2],[0,2,1,3],[0,2,3,1],
                [0,3,1,2],[0,3,2,1],[1,0,2,3],[1,0,3,2],
                [1,2,0,3],[1,2,3,0],[1,3,0,2],[1,3,2,0],
                [2,0,1,3],[2,0,3,1],[2,1,0,3],[2,1,3,0],
                [2,3,0,1],[2,3,1,0],[3,0,1,2],[3,0,2,1],
                [3,1,0,2],[3,1,2,0],[3,2,0,1],[3,2,1,0],
            ]

            order = permutations[seed % len(permutations)]
            shuffled = [all_options[i] for i in order]

            letters = ['A', 'B', 'C', 'D']
            new_options = {}
            new_correct = 'A'

            for i, letter in enumerate(letters):
                new_options[letter] = shuffled[i]
                if shuffled[i] == correct_answer:
                    new_correct = letter

            riddle['options'] = new_options
            riddle['correct'] = new_correct
            return riddle

        try:
            clean = result.strip()
            if "```json" in clean:
                clean = clean.split("```json")[1].split("```")[0].strip()
            elif "```" in clean:
                clean = clean.split("```")[1].split("```")[0].strip()

            riddle = json.loads(clean)
            riddle = shuffle_options(riddle, day, riddle_number)

            fp = riddle.get("fingerprint", "")
            if fp:
                fingerprints[fp] = True
                self.fingerprints = json.dumps(fingerprints)

        except Exception as e:
            return json.dumps({
                "error": str(e)[:100],
                "riddle_number": riddle_number
            })

        # Insert at the correct index, padding with None if needed
        while len(riddles) < riddle_number:
            riddles.append(None)
        riddles[riddle_number - 1] = riddle
        self.daily_riddles = json.dumps(riddles)

        return json.dumps({
            "success": True,
            "day": day,
            "riddle_number": riddle_number
        })

    @gl.public.write
    def mark_generation_complete(self, session_id: str):
        self.generation_complete = json.dumps(True)
        return json.dumps({"success": True})

    @gl.public.write
    def submit_daily_answer(self, session_id: str, username: str, answer: str, riddle_number: int):
        if not self.daily_riddles:
            return json.dumps({"error": "no_riddles_today"})

        current_day = json.loads(self.daily_day_number)
        answers = json.loads(self.daily_answers)

        player_answers = answers.get(session_id, {})
        riddle_key = str(riddle_number)

        if riddle_key in player_answers:
            return json.dumps({"error": "already_answered_this_riddle"})

        riddles = json.loads(self.daily_riddles)

        if riddle_number < 1 or riddle_number > len(riddles):
            return json.dumps({"error": "invalid_riddle_number"})

        riddle = riddles[riddle_number - 1]
        correct = riddle.get("correct", "A").upper()
        is_correct = answer.upper() == correct
        points = 100 if is_correct else 0

        player_answers[riddle_key] = {
            "answer": answer.upper(),
            "correct": is_correct,
            "points": points,
        }
        answers[session_id] = player_answers

        all_answered = len(player_answers) >= len(riddles)
        any_correct = any(
            v.get("correct", False)
            for v in player_answers.values()
        )

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
        player["total_points"] = player.get("total_points", 0) + points
        player["username"] = username

        streak_bonus = 0
        if all_answered:
            last_day = player.get("last_day_answered", 0)
            if last_day == current_day - 1:
                new_streak = player.get("streak", 0) + 1
            else:
                new_streak = 1

            if any_correct:
                if new_streak >= 30:
                    streak_bonus = 100
                elif new_streak >= 7:
                    streak_bonus = 50
                elif new_streak >= 3:
                    streak_bonus = 25

            if any_correct:
                player["streak"] = new_streak
                player["days_correct"] = player.get("days_correct", 0) + 1
            else:
                player["streak"] = 0

            player["longest_streak"] = max(
                player.get("longest_streak", 0),
                player.get("streak", 0)
            )
            player["days_answered"] = player.get("days_answered", 0) + 1
            player["last_day_answered"] = current_day

            if streak_bonus > 0:
                player["total_points"] = player.get("total_points", 0) + streak_bonus

            self._update_leaderboards(session_id, username, player)

        if not all_answered and len(player_answers) >= 1:
            self._update_leaderboards(session_id, username, player)

        players[session_id] = player
        self.players = json.dumps(players)
        self.daily_answers = json.dumps(answers)

        total_correct = sum(
            1 for v in player_answers.values()
            if v.get("correct", False)
        )
        total_answered = len(player_answers)

        return json.dumps({
            "success": True,
            "correct": is_correct,
            "points": points,
            "correct_answer": correct,
            "explanation": riddle.get("explanation", ""),
            "riddle_number": riddle_number,
            "total_answered": total_answered,
            "total_riddles": len(riddles),
            "all_answered": all_answered,
            "total_correct": total_correct,
            "streak_bonus": streak_bonus,
        })

    def _update_leaderboards(self, session_id: str, username: str, player: dict):
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
                "total_points": player["total_points"],
                "streak": player["streak"],
                "days_answered": player["days_answered"],
            })
        all_time.sort(
            key=lambda x: x.get("total_points", 0),
            reverse=True
        )
        self.all_time_leaderboard = json.dumps(all_time[:100])

        weekly = json.loads(self.weekly_leaderboard)
        found_w = False
        for entry in weekly:
            if entry.get("session_id") == session_id:
                entry["points"] = player["total_points"]
                entry["username"] = username
                found_w = True
                break
        if not found_w:
            weekly.append({
                "session_id": session_id,
                "username": username,
                "points": player["total_points"],
            })
        weekly.sort(
            key=lambda x: x.get("points", 0),
            reverse=True
        )
        self.weekly_leaderboard = json.dumps(weekly[:100])

    @gl.public.view
    def get_daily_riddle(self) -> str:
        if not self.daily_riddles:
            return json.dumps({"found": False})
        riddles = json.loads(self.daily_riddles)
        if not riddles:
            return json.dumps({"found": False})
        day = json.loads(self.daily_day_number)
        answers = json.loads(self.daily_answers)
        clean_riddles = [r for r in riddles if r is not None]
        return json.dumps({
            "found": True,
            "riddles": clean_riddles,
            "day": day,
            "total_answers": len(answers),
        })

    @gl.public.view
    def get_daily_answers(self) -> str:
        answers = json.loads(self.daily_answers)
        players = json.loads(self.players)
        result = []
        for sid, player_answers in answers.items():
            if not isinstance(player_answers, dict):
                continue
            total_pts = sum(v.get("points", 0) for v in player_answers.values())
            any_correct = any(v.get("correct", False) for v in player_answers.values())
            username = players.get(sid, {}).get("username", "Anonymous")
            result.append({
                "username": username,
                "correct": any_correct,
                "points": total_pts,
                "answered": len(player_answers),
            })
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

    @gl.public.view
    def get_generation_status(self) -> str:
        return self.generation_complete
