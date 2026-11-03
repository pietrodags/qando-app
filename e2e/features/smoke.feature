@smoke
Feature: The service is up
  As the owner, I want one command that checks a running version,
  so that I know the web, the API and the database work together after a deploy.

  Scenario: The home page reaches the API and the database
    When I open the home page
    Then I see "Servicio funcionando"

  Scenario: An unknown address shows the not-found page
    When I open "/no-existe"
    Then I see the heading "Página no encontrada"
    And the tab title is "Página no encontrada | qando"
