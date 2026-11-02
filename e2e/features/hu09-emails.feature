@HU09
Feature: Summary and "voting closed" emails
  As an organizer, I want to receive the event summary and the "voting closed" email,
  and to know if a send fails, so that I keep my links and know when to decide.

  Background:
    Given today is "2026-06-15" in "Europe/Madrid"
    And emails are delivered to a test mailbox

  Scenario: The summary email is sent when the event is created
    When "ana@example.com" creates the event "Cena de verano" with the dates "2026-07-06" and "2026-07-10" and the deadline "2026-07-01"
    Then "ana@example.com" receives one summary email for "Cena de verano"
    And it contains the options, the deadline with its time zone, the participation link and the management link

  Scenario: The "voting closed" email is sent once at the deadline
    Given "ana@example.com" owns the event "Cena de verano" with the deadline "2026-07-01"
    And "Luis" has voted
    When the clock passes "2026-07-01 23:59" in "Europe/Madrid"
    Then "ana@example.com" receives one "voting closed" email for "Cena de verano"
    And it contains the winners, the alternatives, the results link, the management link and "Confirmar fecha"
    When the email worker runs again
    Then no second "voting closed" email is sent

  Scenario: Closing early sends it at once
    Given "ana@example.com" owns the event "Cena de verano" with the deadline "2026-07-01"
    When the organizer closes voting on "2026-06-20"
    Then the "voting closed" email is sent on "2026-06-20"

  Scenario: Extending the deadline reschedules it
    Given "ana@example.com" owns the event "Cena de verano" with the deadline "2026-07-01"
    When the organizer extends the deadline to "2026-07-03"
    And the clock passes "2026-07-01 23:59" in "Europe/Madrid"
    Then no "voting closed" email has been sent
    When the clock passes "2026-07-03 23:59" in "Europe/Madrid"
    Then one "voting closed" email has been sent

  Scenario: No "voting closed" email after a confirmation or a cancellation
    Given the events "Cena de verano" and "Excursión" with the deadline "2026-07-01"
    When the organizer confirms a date of "Cena de verano" and cancels "Excursión"
    And the clock passes "2026-07-01 23:59" in "Europe/Madrid"
    Then no "voting closed" email has been sent for either event

  Scenario: An SMTP failure keeps the event and can be retried
    Given the SMTP server is down
    When "ana@example.com" creates the event "Cena de verano"
    Then the event exists and its participation link works
    And after the automatic retries the management page shows the summary email as "Envío fallido" with "Reintentar"
    When the SMTP server is back and the organizer presses "Reintentar"
    Then "ana@example.com" receives one summary email
    And the management page shows it as sent

  Scenario: A worker restart resumes the queue without resending sent emails
    Given a sent summary email for "Cena de verano" and a pending one for "Excursión"
    When the email worker stops and restarts
    Then "ana@example.com" has received one summary email for each event

  Scenario Outline: Only the organizer can retry a failed email
    Given the summary email of "Cena de verano" failed
    When someone asks the API to retry it with <credential>
    Then it answers 403 and nothing is sent

    Examples:
      | credential             |
      | the participation link |
      | the results link       |

  Scenario: An email already sent cannot be retried
    Given the summary email of "Cena de verano" was sent
    When the organizer asks the API to retry it
    Then it answers 409 and nothing is sent
