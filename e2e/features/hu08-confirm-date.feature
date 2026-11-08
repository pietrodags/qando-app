@HU08
Feature: Confirm the final date
  As an organizer, I want to confirm the final option,
  so that everyone knows the date is decided.

  Background:
    Given today is "2026-06-15" in "Europe/Madrid"
    And "ana@example.com" owns the event "Cena de verano" with the dates "2026-07-06" and "2026-07-10" and the deadline "2026-07-01"
    And "Luis" and "Marta" have voted, so that "2026-07-10" is recommended

  Scenario: Confirming the recommended option after the deadline
    Given today is "2026-07-02" in "Europe/Madrid"
    When I confirm "viernes 10 de julio" on the management page
    Then the management, results and participation pages show "Fecha confirmada: viernes 10 de julio"

  Scenario: Confirming while voting is open asks first and closes voting
    When I choose to confirm "viernes 10 de julio" on the management page
    Then I am asked to confirm, with "la votación se cerrará"
    When I accept
    Then participants see "Fecha confirmada: viernes 10 de julio" without counts and cannot vote

  # Pending until the "voting closed" email is scheduled (#79).
  @m3
  Scenario: Confirming cancels the pending "voting closed" email
    Given I have confirmed "viernes 10 de julio"
    Then the "voting closed" email of the event will not be sent

  Scenario: Confirming an option that is not the recommended one asks first
    When I choose to confirm "lunes 6 de julio"
    Then I am asked to confirm, with a note that it is not the recommended option

  Scenario: Confirming with no votes asks first
    Given an event "Excursión" owned by "ana@example.com" with no votes
    When I choose to confirm one of its options
    Then I am asked to confirm, with a note that nobody has voted

  Scenario: A confirmation is final
    Given I have confirmed "viernes 10 de julio"
    When the API is asked to confirm "lunes 6 de julio"
    Then it answers 409 and the confirmed date is unchanged

  Scenario: An option from another event is refused
    When the API is asked to confirm an option of another event
    Then it answers 400 and nothing is confirmed

  Scenario Outline: Only the organizer can confirm
    When someone asks the API to confirm "viernes 10 de julio" with <credential>
    Then it answers 403 and nothing is confirmed

    Examples:
      | credential             |
      | the participation link |
      | the results link       |

    # Pending until organizers sign in (HU01).
    @m2
    Examples:
      | credential                       |
      | the session of "bea@example.com" |

  # Pending until organizers sign in (HU01) and "Mis eventos" (#71).
  @m3
  Scenario: The organizer's session can confirm without the management link
    Given I am signed in as "ana@example.com" in a browser without the management link
    When I open "Cena de verano" from "Mis eventos" and confirm "viernes 10 de julio"
    Then the event shows "Fecha confirmada: viernes 10 de julio"
