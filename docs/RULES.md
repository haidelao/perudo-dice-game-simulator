# Rules contract and implementation decisions

Rules version: 1. The supplied plan is the source for these interpretations; no original Da Vinci rule sheet was provided. The app labels these as house rules and makes no claim of official endorsement.

## Bidding and counting

Each player starts with five fair six-sided dice, rerolled each round. A bid `{qty, face}` claims at least `qty` matching dice across all players. Ones count toward faces 2–6 and only ones count toward an ace bid.

Quantity is always a positive integer capped at the number of dice in play. A regular-face raise increases quantity, or keeps quantity and increases face. From regular quantity `q`, switching to aces needs `floor(q/2)+1` or more. From `a` aces, another ace bid must exceed `a`, and a regular-face bid needs at least `2a`. Opening aces are disabled by default; this is configurable.

The cap also applies to ace bids. A maximum regular-face bid may still be raised by switching to aces. A maximum ace bid has no further raises. Tropical still provides a legal challenge when no raise exists.

## Dudo

Only the current player can challenge a standing bid. All active cups reveal. If the count covers the bid, the caller loses one die; otherwise the bidder loses one. Zero dice eliminates a player.

## Calza

Only the current player, holding fewer than five dice, may call exactly right. A correct call gains one die (maximum five); an incorrect call loses one. The round ends in either case. No Calza while responding to Tropical. Calza can be disabled.

## Tropical

Exactly five dice with five distinct faces make a true Tropical; an ace is a distinct face. A five-die player can declare it truthfully or bluff once per player per round, including as the opening move and while blind. It consumes their turn but leaves the standing bid and its bidder unchanged.

The immediately following player can only raise/open or challenge Tropical. They cannot declare another Tropical, challenge the old bid, or Calza. Raising lapses the declaration. Challenging reveals only the declarer's cup and ends the round. A true declaration penalises the challenger; a false one penalises the declarer. Non-declarer cups are not exposed to learning or UI analysis. Tropical can be disabled.

## Blind

The first loss from two dice to one triggers one blind round, immediately next. In that round all players with two or more dice cannot see their own hand; one-die players can. The flag is consumed once per game, and visibility returns in the subsequent round. A blind player may still declare Tropical without knowing if it is true. Blind can be disabled.

## Shootout

If at least two active players all hold exactly one die at a round boundary, Shootout begins. Everyone receives five dice. A round's loser is eliminated outright; survivors keep five and reroll. An explicit `shootoutActive` game flag persists through every subsequent round. It is not inferred again from dice counts. Last survivor wins.

If the first one-die loss also triggers Shootout, the upcoming Shootout round is blind for all players (now holding five dice). This deliberately applies both rules rather than silently suppressing one. Shootout can be disabled.

## Starter and direction

Everyone rolls one die for the first starter; only tied highest players reroll. Opening rolls are retained in state. Each later round starts with its loser, or the successful Calza caller. If that player was eliminated, take the next active seat in the previous round's direction. The new starter chooses a new direction; two-player direction choice is skipped.

## State lifecycle

`direction → bidding → reveal → direction/bidding`, or `bidding → gameOver`. Human acknowledgement advances a revealed round, including when the human has been eliminated. An eliminated human watches the remaining bots until the winner is known.

`applyAction` validates turn ownership and membership in the canonical legal-action set before cloning and changing state. Random state is part of the game state, not a global mutable generator. Reveal hands represent the pre-penalty roll; dice counts represent the post-penalty game. They intentionally differ until the next round rerolls.

The observation contains only public metadata, public round actions, legal actions, and the actor's own dice (or null when blind). It has no game seed, random state, or other hands.

## Omitted physical rules

Hygiene, host adjudication, and comeback/heckling transfers are excluded. The digital engine resolves disputes. There is one human seat and no hot-seat mode, chat system, or revival button. These omissions are explicit rather than partially simulated.
