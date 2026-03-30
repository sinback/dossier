// --- Prompt Bank ---
// Large corpus of parameterized prompts for Imaginative Mode.
// Organized by tag key, then by entry type where the same tag key
// needs different questions for NPCs vs locations vs factions.
//
// Each template function receives (name, val) and returns an array of strings.
// Entry-type-aware templates are keyed as "tagKey:entryType".
// The generator tries "tagKey:entryType" first, then falls back to "tagKey".

export const TAG_PROMPTS = {
  // ──────────────────────────────────────────────
  // ROLE
  // ──────────────────────────────────────────────
  "role:npc": (name, val) => [
    `Is "${val}" actually what ${name} does, or a cover?`,
    `Who else does what ${name} does?`,
    `How replaceable is ${name} as a ${val}?`,
    `Who taught ${name} to be a ${val}?`,
    `What does ${name} get out of being a ${val}?`,
    `Would ${name} still be a ${val} if they had a choice?`,
    `What does ${name} do that a ${val} shouldn't?`,
    `Has anyone else tried to do what ${name} does?`,
    `What happens when a ${val} makes a mistake?`,
    `Does ${name} actually like being a ${val}?`,
    `What's the worst thing ${name} has done in the name of being a ${val}?`,
    `Who relies on ${name} being a ${val}?`,
    `If ${name} quit being a ${val} tomorrow, who'd notice first?`,
    `What's ${name}'s reputation as a ${val} — earned or inflated?`,
    `Is there a version of ${name} that exists outside of being a ${val}?`,
    `What did ${name} do before they were a ${val}?`,
  ],
  "role:faction": (name, val) => [
    `What role does "${val}" play in how ${name} operates?`,
    `Does ${name} rely too much on its ${val} function?`,
    `Who in ${name} actually handles the ${val} work?`,
  ],

  // ──────────────────────────────────────────────
  // FACTION
  // ──────────────────────────────────────────────
  "faction:npc": (name, val) => [
    `What does ${val} actually want from ${name}?`,
    `Is ${name} loyal to ${val}, or just convenient?`,
    `How would ${val} react if ${name} disappeared?`,
    `What's ${name}'s rank within ${val}, really?`,
    `Does ${name} believe in what ${val} stands for?`,
    `What would ${name} do if ${val} asked something unforgivable?`,
    `Has ${name} ever gone against ${val}?`,
    `Who in ${val} does ${name} actually answer to?`,
    `What does ${name} know about ${val} that they shouldn't?`,
    `Would ${name} survive leaving ${val}?`,
    `Is ${name} more useful to ${val} alive or dead?`,
    `What would ${name} trade ${val}'s secrets for?`,
    `Does ${val} actually trust ${name}?`,
    `How did ${name} end up with ${val} in the first place?`,
    `If ${val} collapsed, would ${name} be relieved?`,
    `What has ${name} sacrificed for ${val}?`,
  ],
  "faction:location": (name, val) => [
    `What does ${val} use ${name} for?`,
    `Would ${name} exist without ${val}'s influence?`,
    `What happens at ${name} that ${val} doesn't want people to see?`,
    `If ${val} pulled out of ${name}, who'd move in?`,
    `Does ${val} protect ${name}, or just claim it?`,
    `Is ${name} a headquarters, a front, or just convenient for ${val}?`,
    `What does ${val}'s presence at ${name} tell you about their priorities?`,
    `Who at ${name} would talk about ${val} if you asked the right way?`,
  ],
  "faction:faction": (name, val) => [
    `What does ${name}'s connection to ${val} actually look like day to day?`,
    `Is ${name}'s relationship with ${val} stable, or just quiet?`,
    `What would ${name} do if ${val} went under?`,
    `Does ${name} need ${val} more than ${val} needs ${name}?`,
  ],

  // ──────────────────────────────────────────────
  // MOOD
  // ──────────────────────────────────────────────
  "mood:npc": (name, val) => [
    `Why does ${name} always seem ${val}?`,
    `Is the ${val} thing an act?`,
    `What would make ${name} drop the ${val} mask?`,
    `Have I ever seen ${name} not be ${val}?`,
    `Does being ${val} help ${name}, or is it a liability?`,
    `Is ${name} ${val} around everyone, or just around me?`,
    `What made ${name} this ${val}?`,
    `Who benefits from ${name} being ${val}?`,
    `What happens when ${name}'s ${val} exterior cracks?`,
    `Would I trust ${name} more or less if they stopped being ${val}?`,
    `Is ${name}'s ${val} mood new, or has it always been this way?`,
    `Does ${name} know they come across as ${val}?`,
  ],
  "mood:location": (name, val) => [
    `Why does ${name} always feel so ${val}?`,
    `Is ${name} really ${val}, or does it just look that way from outside?`,
    `Was ${name} always this ${val}?`,
    `What would change the ${val} energy at ${name}?`,
    `Is the ${val} feeling at ${name} a warning or an invitation?`,
    `Who's responsible for ${name} being ${val}?`,
    `Does the ${val} atmosphere at ${name} keep people out or pull them in?`,
  ],
  "mood:faction": (name, val) => [
    `Is ${name}'s ${val} energy a strategy or just how they are?`,
    `What would make ${name} stop being ${val}?`,
    `Does ${name}'s ${val} reputation match what they actually do?`,
    `Who in ${name} sets the ${val} tone?`,
    `Has ${name} always been ${val}, or is this new?`,
    `Does being ${val} make ${name} predictable?`,
  ],

  // ──────────────────────────────────────────────
  // TRAIT
  // ──────────────────────────────────────────────
  "trait:npc": (name, val) => [
    `Does "${val}" make ${name} useful or dangerous?`,
    `Have I seen ${name}'s "${val}" side slip?`,
    `Who else knows ${name} is ${val}?`,
    `Is "${val}" how ${name} protects themselves?`,
    `Would ${name} call themselves ${val}?`,
    `What does "${val}" look like when ${name} is under pressure?`,
    `Has being ${val} ever cost ${name} anything?`,
    `Is ${name} ${val} on purpose, or can't they help it?`,
    `Does "${val}" make it easier or harder to read ${name}?`,
    `Who taught ${name} to be ${val}?`,
    `Is "${val}" the first thing people notice about ${name}, or the last?`,
    `What would ${name} be like without being ${val}?`,
    `Has ${name}'s "${val}" side ever surprised me?`,
  ],
  "trait:location": (name, val) => [
    `Is "${val}" why people come to ${name}, or why they avoid it?`,
    `Does everyone agree that ${name} is ${val}?`,
    `Has ${name} always been ${val}?`,
    `What would ${name} be like if it lost its "${val}" quality?`,
    `Does being ${val} make ${name} more useful or more dangerous?`,
    `Who benefits from ${name} being ${val}?`,
    `Is "${val}" the reputation, or the reality?`,
    `Does ${name}'s "${val}" nature change after dark?`,
  ],
  "trait:faction": (name, val) => [
    `Does "${val}" make ${name} useful or dangerous?`,
    `Is "${val}" a strategy for ${name}, or just their nature?`,
    `Who in ${name} most embodies "${val}"?`,
    `Has being ${val} ever backfired on ${name}?`,
    `Does ${name}'s "${val}" reputation match the reality?`,
    `Who else knows ${name} is ${val}?`,
  ],

  // ──────────────────────────────────────────────
  // LOCATION (as a tag on an entry)
  // ──────────────────────────────────────────────
  "location:npc": (name, val) => [
    `Why does ${name} hang around ${val}?`,
    `What happens at ${val} when ${name} isn't there?`,
    `Who else have I seen at ${val}?`,
    `Is ${val} where ${name} works, or where they hide?`,
    `Does ${name} own anything at ${val}?`,
    `Would ${name} be a different person somewhere else?`,
    `What does ${name} do at ${val} that they wouldn't do anywhere else?`,
    `Is ${name} at ${val} by choice?`,
    `Who at ${val} keeps an eye on ${name}?`,
    `How long has ${name} been at ${val}?`,
    `What would it take to get ${name} to leave ${val}?`,
    `If something happened at ${val}, would ${name} be the first to know?`,
  ],
  "location:location": (name, val) => [
    `What's the relationship between ${name} and ${val}?`,
    `Does being in ${val} change what ${name} means?`,
    `Would ${name} matter if it weren't in ${val}?`,
    `Does ${name} fit in at ${val}, or stick out?`,
    `Is ${name} typical for ${val}, or an exception?`,
    `Who else in ${val} knows about ${name}?`,
    `What would happen to ${name} if ${val} changed?`,
  ],
  "location:faction": (name, val) => [
    `What does ${name}'s presence in ${val} really mean?`,
    `Does ${name} control ${val}, or just operate there?`,
    `Is ${val} loyal to ${name}, or does ${name} have to enforce that?`,
  ],

  // ──────────────────────────────────────────────
  // RELATIONSHIP
  // ──────────────────────────────────────────────
  "relationship:npc": (name, val) => [
    `What's the real deal between ${name} and ${val}?`,
    `Would ${name} sell out ${val}?`,
    `Would ${val} sell out ${name}?`,
    `What does ${name} need from ${val} that they'd never ask for?`,
    `Have I ever seen ${name} and ${val} disagree?`,
    `If ${name} was in trouble, would ${val} show up?`,
    `What does ${name} say about ${val} when they're not around?`,
    `Is ${name} honest with ${val}?`,
    `Is there something between ${name} and ${val} that I'm not supposed to know?`,
    `Who has more power — ${name} or ${val}?`,
    `What would break things between ${name} and ${val}?`,
    `How did ${name} and ${val} actually meet?`,
    `Does ${name} owe ${val} anything?`,
    `Does ${val} owe ${name} anything?`,
    `What do other people think about ${name} and ${val}'s relationship?`,
    `If ${val} disappeared, how long before ${name} noticed?`,
    `Is the ${name}/${val} thing getting better or worse?`,
  ],
  "relationship:faction": (name, val) => [
    `What's the real nature of ${name}'s relationship with ${val}?`,
    `Is ${name}'s connection to ${val} public knowledge?`,
    `Does ${name} treat ${val} as a partner, a tool, or a threat?`,
    `What would it take for ${name} to turn on ${val}?`,
    `Does ${val} know how ${name} really feels about them?`,
  ],

  // ──────────────────────────────────────────────
  // SPECIES
  // ──────────────────────────────────────────────
  "species:npc": (name, val) => [
    `Does being a ${val} affect how ${name} moves through the world?`,
    `Do other ${val}s trust ${name}?`,
    `Does ${name} lean into being a ${val}, or downplay it?`,
    `What can ${name} do because they're a ${val} that others can't?`,
    `What can't ${name} do because they're a ${val}?`,
    `Has being a ${val} ever made things harder for ${name}?`,
    `Do people treat ${name} differently because they're a ${val}?`,
    `Is ${name} proud of being a ${val}?`,
    `What does ${name}'s ${val} instinct look like when they're stressed?`,
    `Where does a ${val} like ${name} feel most at home?`,
    `Does ${name} have other ${val}s in their life?`,
    `What assumptions do people make about ${name} because they're a ${val}?`,
    `Does ${name} trust their ${val} instincts?`,
    `What does a ${val} notice that I wouldn't?`,
  ],

  // ──────────────────────────────────────────────
  // APPEARANCE
  // ──────────────────────────────────────────────
  "appearance:npc": (name, val) => [
    `What's the story behind ${name}'s ${val}?`,
    `Does ${name}'s ${val} make people trust them more or less?`,
    `Is ${name}'s ${val} something they chose, or something that happened to them?`,
    `Does ${name} try to hide their ${val}?`,
    `Who notices ${name}'s ${val} first?`,
    `What does ${name}'s ${val} say about where they've been?`,
    `Has ${name}'s ${val} ever been useful to them?`,
    `Does ${name}'s ${val} change how I feel about them?`,
    `Do people stare at ${name}'s ${val}?`,
  ],

  // ──────────────────────────────────────────────
  // VIBE (locations)
  // ──────────────────────────────────────────────
  "vibe:location": (name, val) => [
    `Why does ${name} feel so ${val}?`,
    `Was ${name} always ${val}, or is this recent?`,
    `Is the ${val} quality at ${name} getting better or worse?`,
    `Who else has noticed that ${name} is ${val}?`,
    `Does the ${val} feeling at ${name} bother anyone else?`,
    `What would it take to change ${name}'s ${val} atmosphere?`,
    `Is there something underneath the ${val} that I'm not seeing?`,
    `Am I comfortable with ${name} being ${val}?`,
    `Does the ${val} at ${name} mean something, or is it just how things are?`,
    `What does ${name} being ${val} say about the people who live there?`,
  ],

  // ──────────────────────────────────────────────
  // CONCERN
  // ──────────────────────────────────────────────
  "concern:location": (name, val) => [
    `How bad is the ${val} situation at ${name}, really?`,
    `Who's responsible for the ${val} at ${name}?`,
    `Is anyone actually doing anything about the ${val}?`,
    `Does the ${val} at ${name} affect me personally?`,
    `Is the ${val} at ${name} getting worse?`,
    `Who benefits from the ${val} at ${name} continuing?`,
    `Does everyone know about the ${val}, or is it being covered up?`,
    `What happens to ${name} if the ${val} isn't addressed?`,
    `Is the ${val} at ${name} connected to something bigger?`,
    `Who's most affected by the ${val}?`,
  ],
  "concern:faction": (name, val) => [
    `How seriously does ${name} take the ${val} problem?`,
    `Is ${name} making the ${val} situation better or worse?`,
    `Does ${name} even acknowledge the ${val}?`,
    `Who in ${name} is actually worried about ${val}?`,
    `Is the ${val} a threat to ${name}, or an opportunity?`,
  ],
};

// ──────────────────────────────────────────────
// UNIVERSAL PROMPTS (no tag needed)
// Organized by entry type.
// ──────────────────────────────────────────────

export const UNIVERSAL_PROMPTS = {
  npc: (name) => [
    // Self / gut reactions
    `Do I trust ${name}?`,
    `Is ${name} hot?`,
    `What's ${name}'s deal?`,
    `Would I get a drink with ${name}?`,
    `Gut feeling about ${name}?`,
    `Am I overthinking ${name}?`,
    `What am I not seeing about ${name}?`,
    `What does ${name} think of me?`,
    `If things go south, whose side is ${name} on?`,
    `What would ${name} do if they had my job?`,

    // Deeper reads
    `What is ${name} afraid of?`,
    `What does ${name} want that they won't say out loud?`,
    `What's ${name}'s tell when they're lying?`,
    `Who does ${name} talk to when no one's watching?`,
    `What would ${name} do with real power?`,
    `What does ${name} think they deserve?`,
    `Is ${name} the same person in public and in private?`,
    `What's the worst thing ${name} has done?`,
    `What would ${name} never forgive?`,
    `Has ${name} ever been truly kind to someone?`,
    `What does ${name} do when they're alone?`,
    `What does ${name}'s body language say when they think I'm not looking?`,
    `Is ${name} building something, or just surviving?`,

    // Social web
    `Who does ${name} actually care about?`,
    `Who would come to ${name}'s funeral?`,
    `Is there anyone ${name} is protecting?`,
    `Who is ${name} avoiding?`,
    `If I needed to find ${name} at 3am, where would I look?`,
    `Who knows ${name} best?`,
    `Does ${name} have anyone they can be honest with?`,
    `Who has ${name} wronged?`,
    `Is ${name} lonely?`,

    // Trajectory
    `Is ${name} getting more dangerous or less?`,
    `Where does ${name} see themselves in a year?`,
    `Is ${name} moving toward something or running from something?`,
    `When was the last time ${name} surprised me?`,
    `Has ${name} changed since I first met them?`,
    `What would it take to genuinely surprise ${name}?`,
    `Is ${name} holding a grudge?`,
    `Is ${name} capable of change?`,

    // The work
    `Can I use ${name}?`,
    `Can ${name} use me?`,
    `What would ${name} want in exchange for a favor?`,
    `If I needed one person on my side right now, would it be ${name}?`,
    `Would I want ${name} behind me in a tight spot?`,
    `Is ${name} someone I should be watching more closely?`,
    `What would I do if ${name} turned up dead?`,
    `Am I being fair to ${name}?`,
  ],

  faction: (name) => [
    // Power & structure
    `What's ${name}'s real agenda?`,
    `Who actually runs ${name}?`,
    `Am I on ${name}'s radar?`,
    `What's ${name}'s weak spot?`,
    `Who in ${name} could I actually talk to?`,
    `Is ${name} growing or dying?`,
    `What would the city look like without ${name}?`,

    // Character
    `Does ${name} believe their own story?`,
    `What's the gap between what ${name} says and what ${name} does?`,
    `Is ${name} pragmatic, or just ruthless?`,
    `What does ${name} think it's protecting?`,
    `Does ${name} have a conscience, or just a reputation?`,
    `What's the most dangerous thing about ${name}?`,
    `Would ${name} exist if there wasn't money in it?`,

    // Relationships
    `Who's ${name}'s biggest enemy?`,
    `Does ${name} have allies, or just interests?`,
    `Who used to be part of ${name} and isn't anymore?`,
    `Is there anyone inside ${name} who disagrees with the direction?`,
    `If I wanted to hurt ${name}, where would I start?`,
    `Who benefits most from ${name}'s success?`,
    `What does ${name} owe, and to whom?`,

    // Stakes
    `What would make ${name} desperate?`,
    `What's ${name} willing to sacrifice?`,
    `If ${name} went to war, who would they go after?`,
    `What does ${name} want that it can't buy?`,
    `Is ${name} a cause, or just a racket?`,
    `What would it take to make ${name} irrelevant?`,
    `Is anyone inside ${name} planning something?`,
  ],

  location: (name) => [
    // Surface
    `What really goes on at ${name}?`,
    `Who controls ${name}?`,
    `Is ${name} safe?`,
    `What's changed about ${name} recently?`,
    `Who have I seen at ${name}?`,
    `What's the vibe at ${name} after dark?`,
    `What would I miss if ${name} disappeared?`,

    // Deeper
    `What's ${name} hiding?`,
    `Who comes to ${name} that shouldn't?`,
    `What happens at ${name} that nobody talks about?`,
    `Is ${name} what it looks like from the outside?`,
    `What does ${name} sound like when I close my eyes?`,
    `Who was at ${name} before it was what it is now?`,
    `What does ${name} smell like?`,
    `What's the light like at ${name}?`,
    `Is there a part of ${name} I haven't seen yet?`,

    // Stakes
    `Who would fight over ${name}?`,
    `What would it take to shut ${name} down?`,
    `Is ${name} getting better or worse?`,
    `Who depends on ${name}?`,
    `If something happened at ${name}, who'd know first?`,
    `Is ${name} a meeting place, a hiding place, or a trap?`,
    `Does ${name} belong to anyone?`,
    `What would ${name} be like if everything went right?`,
  ],
};
