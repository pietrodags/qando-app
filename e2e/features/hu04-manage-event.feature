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

  Scenario: Options can be edited while nobody has voted
    Given I am on the management page of "Cena de verano"
    When I press "Editar opciones", add the date "2026-07-11" and save
    Then the participation link, which has not changed, shows the dates 6, 10 and 11 July
    And the title and the note cannot be edited

  Scenario: Options cannot be edited once someone has voted
    Given "Luis" has voted on "Cena de verano"
    When I open its management page
    Then "Editar opciones" is disabled with "Ya hay votos: las opciones no se pueden cambiar"

  Scenario: A vote that arrives while editing stops the save
    Given I am editing the options of "Cena de verano"
    And "Luis" votes on "Cena de verano"
    When I save the options
    Then I see that someone has voted and the options were not changed
    And the vote of "Luis" is kept

  Scenario: Closing early and extending the deadline
    Given I am on the management page of "Cena de verano"
    When I press "Cerrar votación" and confirm
    Then the voting page says "Votación cerrada"
    When I extend the deadline to "2026-07-03"
    Then the voting page lets participants vote again

  Scenario: The deadline cannot be extended to the past
    When I try to extend the deadline of "Cena de verano" to "2026-06-10"
    Then I see a message next to the date and the deadline is unchanged

  Scenario: Cancelling deletes the event and leaves a message to forward
    Given "Luis" has voted on "Cena de verano"
    When I press "Cancelar evento" on its management page and confirm
    Then I see a ready-to-send "Evento cancelado" text with "Cena de verano" and buttons to copy and share it
    And the options, participations, votes and pending emails of the event are deleted
    And the participation, management and results links show "Este evento ha sido cancelado" with "Cena de verano"
    And the API rejects every change to the event

  Scenario Outline: Management is refused without the right credential
    When someone asks the API to cancel "Cena de verano" with <credential>
    Then it answers 403 and the event is unchanged

    Examples:
      | credential                             |
      | no credential                          |
      | the participation link                 |
      | the results link                       |
      | a wrong management token               |
      | the session of "bea@example.com"       |
