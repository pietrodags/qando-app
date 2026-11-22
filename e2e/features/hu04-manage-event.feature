@HU04
Feature: Manage, edit and cancel my events
  As an organizer, I want to see, edit and cancel my events,
  so that I can fix mistakes and keep my group informed.

  Background:
    Given today is "2026-06-15" in "Europe/Madrid"
    And "ana@example.com" owns the event "Cena de verano" with the dates "2026-07-06" and "2026-07-10" and the deadline "2026-07-01"

  Scenario: "Mis eventos" lists only my events, newest first
    Given "bea@example.com" owns the event "Partido"
    And "ana@example.com" created "Excursión" after "Cena de verano"
    When I sign in as "ana@example.com" and open "Mis eventos"
    Then I see the events "Excursión" and "Cena de verano", in this order, with their state and deadline
    And I do not see "Partido"

  Scenario: The management link works with or without a session
    When I open the management link of "Cena de verano" in a new browser
    Then I see its management page
    When I sign in as "ana@example.com" and open it from "Mis eventos"
    Then I see the same management page

  @wip
  Scenario: Options can be edited while nobody has voted
    Given I am on the management page of "Cena de verano"
    When I press "Editar opciones", add the date "2026-07-11" and save
    Then the participation link, which has not changed, shows the dates 6, 10 and 11 July
    And the title and the note cannot be edited

  @wip
  Scenario: Options cannot be edited once someone has voted
    Given "Luis" has voted on "Cena de verano"
    When I open its management page
    Then "Editar opciones" is disabled with "Ya hay votos: las opciones no se pueden cambiar"

  @wip
  Scenario: A vote that arrives while editing stops the save
    Given I am editing the options of "Cena de verano"
    And "Luis" votes on "Cena de verano"
    When I save the options
    Then I am back on its management page, which says that someone has voted
    And "Editar opciones" is disabled with "Ya hay votos: las opciones no se pueden cambiar"
    And the options were not changed
    And the vote of "Luis" is kept

  @wip
  Scenario: "Volver sin guardar" leaves the options unchanged
    Given I am editing the options of "Cena de verano"
    When I add the date "2026-07-11" and press "Volver sin guardar"
    Then I see its management page
    And the participation link shows the options:
      | option     |
      | lun 6 jul  |
      | vie 10 jul |

  @wip
  Scenario: Options already past are dropped when the editor opens
    Given "ana@example.com" owns the event "Excursión" with the dates "2026-06-20" and "2026-07-10" and the deadline "2026-07-05"
    And the clock passes "2026-06-24 23:59" in "Europe/Madrid"
    When I press "Editar opciones" on the management page of "Excursión"
    Then the editor holds only the date "2026-07-10"
    And a line names the dropped date "2026-06-20"

  @wip
  Scenario: A vote sent with options replaced since the page loaded shows the new options
    Given a participant has opened the participation link of "Cena de verano"
    And I replace its options with the dates "2026-07-11" and "2026-07-12"
    When the participant confirms their vote
    Then the vote is not stored
    And the voting page shows the new options with "Las opciones han cambiado. Revisa tu voto."

  @wip
  Scenario: Closing early and extending the deadline
    Given I am on the management page of "Cena de verano"
    When I press "Cerrar votación" and confirm
    Then the voting page says "Votación cerrada"
    When I extend the deadline to "2026-07-03"
    Then the voting page lets participants vote again

  @wip
  Scenario: Closing an event already closed changes nothing
    Given voting on "Cena de verano" was closed early on "2026-06-20"
    When "Cerrar votación" is pressed again on "2026-06-22", from a tab opened before
    Then the pages still say that voting closed on "2026-06-20"
    And no second "voting closed" email is sent

  @wip
  Scenario: The deadline offers no day before today
    When I open the management page of "Cena de verano"
    Then the deadline selects offer no day before "2026-06-15"

  Scenario: Cancelling deletes the event and leaves a message to forward
    Given "Luis" has voted on "Cena de verano"
    When I press "Cancelar evento" on its management page and confirm
    Then I see the text 'Se ha cancelado "Cena de verano".' with buttons to copy and share it
    And the options, participations, votes and pending emails of the event are deleted
    And the participation, management and results links show "Este evento ha sido cancelado" with "Cena de verano"
    And the API rejects every change to the event

  Scenario: The management link of a cancelled event, opened later, still shows the text to forward
    Given "Cena de verano" has been cancelled
    When I open the management link of "Cena de verano" in a new browser
    Then I see the text 'Se ha cancelado "Cena de verano".' with buttons to copy and share it
    When I reload the page
    Then I see the text 'Se ha cancelado "Cena de verano".' with buttons to copy and share it

  @wip
  Scenario: An expired session on the management page asks to sign in and comes back to the event
    Given I am signed in as "ana@example.com" in a browser without the management link
    And I have opened "Cena de verano" from "Mis eventos"
    And my session has expired an hour after signing in
    When I reload the page
    Then I am asked to sign in
    When I sign in with "ana@example.com" and the emailed code
    Then I see its management page

  Scenario Outline: Management is refused without the right credential
    When someone asks the API to cancel "Cena de verano" with <credential>
    Then it answers <status> and the event is unchanged

    Examples:
      | credential                       | status |
      | no credential                    | 401    |
      | the participation link           | 403    |
      | the results link                 | 403    |
      | a wrong management token         | 403    |
      | the session of "bea@example.com" | 403    |
