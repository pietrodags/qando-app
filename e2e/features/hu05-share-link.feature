@HU05
Feature: Share the participation link
  As an organizer, I want to share a participation link,
  so that my group can vote without an account.

  Background:
    Given "ana@example.com" owns the event "Cena de verano"

  Scenario: The link can be copied and shared
    When I reach the "¡Hecho!" step of "Cena de verano"
    Then I see the participation link with "Copiar" and the WhatsApp and email share buttons
    When I press "Copiar"
    Then the participation link is in the clipboard and I see a confirmation

  Scenario: The link opens without an account
    When I open the participation link in a private window
    Then I see the voting page of "Cena de verano"

  Scenario: A shared link shows a preview with the title
    When a chat app reads the participation link
    Then the preview title is "Cena de verano"

  Scenario: An event that does not exist
    When I open a participation link of an event that does not exist
    Then I see "Página no encontrada"

  Scenario: An event that cannot be loaded
    Given the API is unreachable
    When I open the participation link
    Then I see "No se ha podido cargar" with "Reintentar"
    When the API is back and I press "Reintentar"
    Then I see the voting page of "Cena de verano"

  Scenario: A cancelled event
    Given "Cena de verano" has been cancelled
    When I open the participation link
    Then I see "Este evento ha sido cancelado" and "Cena de verano"

  Scenario: The participation link exposes only public data
    When the API is asked for the event with the participation link
    Then the answer has the title, the organizer's name, the note, the deadline and the options
    And it has no organizer email, no management or results token and no session data
