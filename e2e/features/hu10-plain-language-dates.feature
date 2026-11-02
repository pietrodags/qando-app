@HU10
Feature: Dates in plain language
  As an organizer, I want to type dates in plain language,
  so that I can propose many dates quickly.

  Background:
    Given today is "2026-06-15" in "Europe/Madrid"
    And I am on the dates step of the creation wizard
    And the date interpreter answers from recorded fixtures

  Scenario: Every Monday of a month
    When I ask for "todos los lunes de julio"
    Then the calendar selects "2026-07-06", "2026-07-13", "2026-07-20" and "2026-07-27" for me to review

  Scenario: A range becomes one option
    When I ask for "del 3 al 7 de agosto"
    Then the calendar selects the range "2026-08-03..2026-08-07" as one option

  Scenario: Interpreted dates can be corrected by hand
    Given I have asked for "todos los lunes de julio"
    When I remove "2026-07-20" on the calendar and add "2026-07-22"
    Then the event is created with "2026-07-06", "2026-07-13", "2026-07-22" and "2026-07-27"

  Scenario: Text that is partly understood says what was left out
    When I ask for "los lunes de julio y cuando venga mi primo"
    Then I see which part was not understood
    And the Mondays of July are selected

  Scenario: Text that is not understood keeps the previous selection
    Given I have chosen "2026-07-06" on the calendar
    When I ask for "algún día"
    Then I see that the text was not understood
    And "2026-07-06" is still selected

  Scenario: An empty request is not sent
    When I ask for ""
    Then no request reaches the interpreter

  Scenario Outline: Interpreter failures keep the form and the manual calendar
    Given the date interpreter will <failure>
    When I ask for "todos los lunes de julio"
    Then I see "No se ha podido interpretar"
    And the text I typed is still there
    And I can choose dates on the calendar by hand

    Examples:
      | failure                                    |
      | fail                                       |
      | time out                                   |
      | answer with dates more than 12 months away |
      | answer with something that is not dates    |

  Scenario: Too many requests are limited
    Given I have made the maximum number of requests allowed
    When I ask for "todos los lunes de julio"
    Then I see "Demasiadas peticiones, inténtalo en un momento"

  Scenario: The browser never calls the AI provider
    When I ask for "todos los lunes de julio"
    Then the browser only called the qando API
    And the page and its scripts contain no AI credentials
