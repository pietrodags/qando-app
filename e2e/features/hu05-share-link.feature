@HU05
Feature: Share the participation link
  As an organizer, I want to share a participation link,
  so that my group can vote without an account.

  Background:
    Given today is "2026-06-15" in "Europe/Madrid"
    And "ana@example.com" owns the event "Cena de verano"

  Scenario: The link can be shared from "¡Hecho!"
    Given I am signed in as "ana@example.com" with the name "Ana"
    When I create the event "Excursión al lago" with the dates "2026-07-06" and "2026-07-10"
    Then I see the "¡Hecho!" step with the participation link
    And WhatsApp, Telegram and email share the participation link with '¡Vota tus preferencias para "Excursión al lago"!'
    When I press "Copiar enlace"
    Then the participation link is in the clipboard and I see "Enlace copiado"

  @wip
  Scenario: The link opens without an account
    When I open the participation link in a private window
    Then I see the voting page of "Cena de verano"

  @wip
  Scenario: A shared link shows a preview with the title
    When a chat app reads the participation link
    Then the preview title is "Cena de verano"

  Scenario: An event that does not exist
    When I open a participation link of an event that does not exist
    Then I see "Página no encontrada"

  @wip
  Scenario: An event that cannot be loaded
    Given the API is unreachable
    When I open the participation link
    Then I see "No se ha podido cargar" with "Reintentar"
    When the API is back and I press "Reintentar"
    Then I see the voting page of "Cena de verano"

  @wip
  Scenario: A cancelled event
    Given "Cena de verano" has been cancelled
    When I open the participation link
    Then I see "Este evento ha sido cancelado" and "Cena de verano"

  @wip
  Scenario: The participation link exposes only public data
    When the API is asked for the event with the participation link
    Then the answer has the title, the organizer's name, the note, the deadline and the options
    And it has no organizer email, no management or results token and no session data
