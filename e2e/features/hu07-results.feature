@HU07
Feature: Compare the options
  As an organizer, I want to compare the options,
  so that I can see which date suits the group.

  Background:
    Given today is "2026-06-15" in "Europe/Madrid"
    And "ana@example.com" owns the named event "Cena de verano" with the dates "2026-07-06", "2026-07-10" and "2026-07-11" and the deadline "2026-07-01"

  Scenario: The option with the most attendance wins
    Given these votes:
      | voter  | 2026-07-06 | 2026-07-10 | 2026-07-11  |
      | Luis   | available  | preferred  | unavailable |
      | Marta  | available  | available  | unavailable |
      | Álvaro | unavailable| available  | available   |
    When I open the results link
    Then the winner is "viernes 10 de julio" with 3 attending and 0 not attending
    And no alternatives are shown
    And the names are listed alphabetically: "Álvaro", "Luis", "Marta"

  Scenario: Preferences break a tie in attendance
    Given these votes:
      | voter | 2026-07-06 | 2026-07-10 | 2026-07-11  |
      | Luis  | preferred  | available  | unavailable |
      | Marta | available  | available  | unavailable |
    When I open the results link
    Then the winner is "lunes 6 de julio"
    And the alternatives show "viernes 10 de julio" with 2 attending

  Scenario: A persistent tie between two options lists both
    Given these votes:
      | voter | 2026-07-06 | 2026-07-10 | 2026-07-11  |
      | Luis  | preferred  | available  | unavailable |
      | Marta | available  | preferred  | unavailable |
    When I open the results link
    Then I see "Hay un empate entre dos opciones:" with "lunes 6 de julio" and "viernes 10 de julio"

  Scenario: No votes yet
    When I open the results link
    Then I see "Aún no ha votado nadie."

  Scenario: Nobody can attend any option
    Given every voter marked every option as unavailable
    When I open the results link
    Then there is no winner and a message says nobody can attend any option

  Scenario: Results are provisional before the deadline and final after
    Given "Luis" has voted
    When I open the results link
    Then the results are marked "provisional"
    Given today is "2026-07-02" in "Europe/Madrid"
    When I open the results link
    Then the results are marked "final"

  Scenario: Anonymous events show no names
    Given an anonymous event "Cena anónima" with 2 votes
    When I open its results link
    Then I see the counts and no names
    And the API answer for its results has no names

  Scenario: A confirmed date is shown apart from the recommendation
    Given the organizer has confirmed "2026-07-11"
    When I open the results link
    Then I see "Fecha confirmada: sábado 11 de julio" apart from the recommended option

  Scenario: The results are reachable from the management page and from "Mis eventos"
    When I open the management link
    Then I can open the results
    When I sign in as "ana@example.com" and open "Cena de verano" from "Mis eventos"
    Then I can open the results

  Scenario: The participation link gives no access to the results
    When the API is asked for the results with the participation link
    Then it answers 403
    When I open a results link that does not exist
    Then I see "Este evento no existe"
