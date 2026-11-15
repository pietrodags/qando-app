@HU03
Feature: Create an event with date and time options
  As an organizer, I want to create an event with date and time options,
  without filling a sign-up form, so that my group can tell me when they can meet.

  Background:
    Given today is "2026-06-15" in "Europe/Madrid"

  @wip
  Scenario: An event with dates only is created and gets its links
    Given I am signed in as "ana@example.com" with the name "Ana"
    When I create the event "Cena de verano" with the dates "2026-07-06" and "2026-07-10"
    Then I see the "¡Hecho!" step with the participation link
    And the participation link shows the options:
      | option         |
      | lun 6 jul      |
      | vie 10 jul     |
    And the event has a management link and a results link, both different from the participation link

  @wip
  Scenario: Each time is one option and a date without times is a whole day
    Given I am signed in as "ana@example.com" with the name "Ana"
    When I create the event "Cena de verano" with the options:
      | dates      | time        |
      | 2026-07-06 | 18:15       |
      | 2026-07-06 | 20:00-22:00 |
      | 2026-07-10 |             |
    Then participants vote on exactly these 3 options, in this order:
      | option                  |
      | lun 6 jul, 18:15        |
      | lun 6 jul, 20:00–22:00  |
      | vie 10 jul, sin horario |

  @wip
  Scenario: Overlapping options are kept apart
    Given I am signed in as "ana@example.com" with the name "Ana"
    When I create the event "Viaje" with the options:
      | dates                 |
      | 2026-07-06..2026-07-09 |
      | 2026-07-08            |
    Then participants vote on 2 options

  @wip
  Scenario: The summary lists every option as it will be voted
    Given I have chosen the date "2026-07-10" and the date "2026-07-06" with the times "20:00-22:00" and "18:15"
    When I reach the summary step
    Then it lists, in this order:
      | option                  |
      | lun 6 jul, 18:15        |
      | lun 6 jul, 20:00–22:00  |
      | vie 10 jul, sin horario |

  @wip
  Scenario: The event survives an API restart
    Given I am signed in as "ana@example.com" with the name "Ana"
    And I have created the event "Cena de verano"
    When the API restarts
    Then the participation link still shows "Cena de verano" with its options

  Scenario: "Siguiente" stays disabled until the step is valid
    When I open the creation wizard
    Then "Siguiente" is disabled
    And no field is marked as valid
    And screen readers hear with "Siguiente": "Completa tu nombre y el título del evento."
    When I type my name "Ana"
    Then only the name field is marked as valid
    And screen readers hear with "Siguiente": "Completa el título del evento."
    When I type the title "Cena de verano"
    Then both fields are marked as valid
    And "Siguiente" is enabled

  Scenario: Enter goes to the dates step once the step is valid
    Given I have opened the creation wizard
    When I type my name "Ana" and press Enter
    Then I am still on step 1
    When I type the title "Cena de verano" and press Enter
    Then I am on step 2

  @wip
  Scenario: A deadline after the first date warns but does not block
    Given I am signed in as "ana@example.com" with the name "Ana"
    And I have chosen the date "2026-07-06"
    When I set the deadline to "2026-07-08"
    Then I see a warning that the deadline is after the first date
    And I can still create the event

  @wip
  Scenario: The API enforces the option limits
    Given I am signed in as "ana@example.com" with the name "Ana"
    When the API is asked to create an event with 61 options
    Then it answers 400 and no event is created
    When the API is asked to create an event with a date on "2027-07-01"
    Then it answers 400 and no event is created
    When the API is asked to create an event with two equal options
    Then it answers 400 and no event is created
    When the API is asked to create an event with the time range "20:00-19:00"
    Then it answers 400 and no event is created

  @wip
  Scenario: A server error keeps the wizard
    Given I am signed in as "ana@example.com" with the name "Ana"
    And the API will fail the next request
    When I press "Crear"
    Then I see an error with "Reintentar"
    And the wizard still holds everything I entered
