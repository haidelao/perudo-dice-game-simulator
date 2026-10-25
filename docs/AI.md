# Smart people, not GTO

## Intent

An approachable, varied table of thoughtful players. Bots should know basic odds, show individual habits, vary near-equivalent moves, sometimes bluff, and occasionally misjudge. There is no claim of optimality, equilibrium, human equivalence, or measured playing strength.

Personalities: Maya reads the table; Theo pushes bids; Jules balances risk; Nico challenges more readily; Ada varies more. They differ in challenge inclination, willingness to pressure without support, and decision noise. Difficulty changes sampling accuracy and noise; it does not grant hidden information. Personalities are heuristics requiring human playtesting, not trained psychological models.

## Information and beliefs

`observation()` strips other hands and the dice RNG state/seed. A module worker receives only an observation, public-reveal-derived profiles, an independent policy seed, and request ID. It is an engineering fairness boundary, not a browser security boundary.

Unknown hands are enumerated as multisets with correct multinomial prior weights (6/21/56/126/252 possibilities for 1–5 dice). Recent bids and Tropical declarations temper these weights using a small behavioural likelihood model. This is approximate modelling; probabilities are not described as universally exact Bayesian truth. The model does not currently use every non-call as evidence.

Blind hands retain their prior even after the blind player bids: a blind player's bid is not evidence about their unseen dice. A one-die player who can see their die is still informative. Learning skips invisible cups and blind hands.

Profiles track support for bid faces, true versus bluffed Tropical declarations, and approximate coverage at challenges, with prior counts and slow forgetting. They adapt within a game and reset at a new game. Every bot receives the same public learning data; no private observations are shared between bots.

## Decisions

Candidates include small raises on each face, a handful of quantities around plausible coverage, Dudo, eligible Calza, and Tropical actions. Sampled hidden worlds are shared across candidate evaluations to reduce comparison noise.

Direct challenges use estimated coverage. Raises combine a probabilistic model of the next player's call/Calza response with a small continuation-pressure heuristic. The responding hand and bid coverage are evaluated on the **same sampled world**, preserving their correlation. The simulated next player sees only their own hand, or no hand when blind. The outer evaluation can use the world to score the outcome but never supplies that world to the simulated player's policy.

Die loss and elimination have heuristic costs. The app does not use a purported full-game win-probability table, discard seating through sorted keys, or grade human moves by fictitious exact EV. The Shootout flag changes elimination cost. A softmax over sufficiently close candidate scores creates varied, imperfect play. Approximate scores are not dice EV or game-win probabilities.

Tropical declaration value uses a simple fixed challenge likelihood; challenge decisions integrate the declarer's weighted possible hands. Direction is intentionally randomised, a modest limitation that preserves varied tables.

## Independence and replay

Dice use a seeded generator in engine state. Policy randomness has a separate, independently generated seed saved in the replay envelope. The worker receives a derived policy seed per seat and action count, never the dice seed. Increasing AI sample count cannot consume or alter future dice rolls. Recorded actions reproduce the same game regardless of future AI revisions; continuing a replay may diverge if bot code changes.

## Explanations

Bot decision notes are held outside the live UI and shown only after a full reveal. A Tropical partial reveal suppresses all round analysis, even if another cup's hand is known internally. Explanation numbers are finite-sample model estimates from that actor's viewpoint. Imported/resumed games do not regenerate old private notes; new notes appear for subsequent turns.

## Next improvements

Human playtesting should tune personality separation, excessive challenges, face preferences, bluff frequency, and Calza risk. A balanced-seat tournament against fixed baseline bots would help measure strength. The provided smoke harness tests termination, legality, and latency, not realism or competitiveness. Online multiplayer and trusted results require a server-owned rules state.
