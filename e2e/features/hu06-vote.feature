@HU06
Feature: Vote and edit my vote
  As a participant, I want to say which options suit me and which one I prefer,
  and to correct my answer, so that the organizer can find the date that works best.

  Background:
    Given today is "2026-06-15" in "Europe/Madrid"
    And a named event "Cena de verano" with the dates "2026-07-06", "2026-07-10" and "2026-07-11" and the deadline "2026-07-01"

  Scenario: A participant votes
    When I open the participation link and type the name "Luis"
    And I mark "2026-07-06" as available, "2026-07-10" as preferred and "2026-07-11" as unavailable
    And I confirm my vote
    Then I see the thank-you screen with a private "Editar mi voto" link
    And the results of "Cena de verano" show "Luis" available on 6 and 10 July, preferring 10 July

  Scenario: Only one option can be preferred
    When I open the participation link and type the name "Luis"
    And I mark "2026-07-06" as preferred
    And I mark "2026-07-10" as preferred
    Then only "2026-07-10" is preferred and "2026-07-06" is available

  @wip
  Scenario: The same browser reopens the vote to edit it
    Given I have voted as "Luis" with "2026-07-06" available
    When I open the participation link again in the same browser
    Then I see my previous answers
    When I mark "2026-07-06" as unavailable and confirm
    Then the results count 1 voter and "Luis" is unavailable on 6 July

  @wip
  Scenario: The private link edits the vote from another browser
    Given I have voted as "Luis"
    When I open my "Editar mi voto" link in another browser
    Then I see my previous answers

  Scenario: A name needs at least two characters
    When I open the participation link and type the name "A"
    Then the voting choices are disabled
    When I type the name "Li"
    Then the voting choices are enabled

  @wip
  Scenario: An anonymous event never asks for or stores a name
    Given an anonymous event "Cena anónima" with the date "2026-07-06"
    When I vote on it
    Then I was not asked for a name
    And the API stores no name for my vote

  Scenario: Submitting twice stores one vote
    When I confirm my vote twice in a row
    Then the results count 1 voter

  Scenario: Two tabs of the same browser store one vote
    When I confirm my vote in two tabs of the same browser at once
    Then the results count 1 voter

  @wip
  Scenario: Voting is closed after the deadline
    Given today is "2026-07-02" in "Europe/Madrid"
    When I open the participation link
    Then I see "Votación cerrada" and no options to vote

  @wip
  Scenario: A vote sent after the deadline from an open page is refused
    Given I have opened the participation link on "2026-07-01" at 23:58
    When I confirm my vote at 00:01 on "2026-07-02"
    Then the vote is not stored
    And I see "Votación cerrada"

  @wip
  Scenario: A confirmed event shows the date without counts
    Given the organizer has confirmed "2026-07-10"
    When I open the participation link
    Then I see "Fecha confirmada: viernes 10 de julio" without any counts
    And I cannot vote

  @wip
  Scenario Outline: The API rejects invalid votes
    When the API receives a vote with <problem>
    Then it answers 400 and nothing is stored

    Examples:
      | problem                              |
      | an option from another event         |
      | an option of the event missing       |
      | an unknown state                     |
      | two preferred options                |
