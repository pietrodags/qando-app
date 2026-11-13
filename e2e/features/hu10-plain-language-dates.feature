@HU10
Feature: Dates in plain language
  As an organizer, I want to type dates and times in plain language,
  so that I can propose many options quickly.

  Background:
    Given today is "2026-06-15" in "Europe/Madrid"
    And I am on the dates step of the creation wizard
    And the text editor returns the phrase unchanged

  Scenario: Every Monday of a month is marked at once
    When I ask for "todos los lunes de julio"
    Then the calendar has "2026-07-06", "2026-07-13", "2026-07-20" and "2026-07-27" selected
    And the smart calendar is closed

  Scenario: A range becomes one option
    When I ask for "del 3 al 7 de agosto"
    Then the calendar has the range "2026-08-03..2026-08-07" as one option

  Scenario: A time that is understood goes to the hours
    When I ask for "el viernes a las 21:00"
    Then the calendar has "2026-06-19" selected
    And the hours summary shows "vie 19 jun" with "21:00"

  Scenario: A time range can end the next day
    When I ask for "el viernes de 22 a 3"
    Then the hours summary shows "vie 19 jun" with "22:00 ⬇ 3:00 (+1)"

  Scenario: A bare hour is asked before anything is marked
    When I ask for "el viernes por la tarde y el sábado a las 8"
    Then I see the question "«a las 8» del sáb 20 jun: ¿mañana o tarde?"
    And no date is selected yet
    When I answer "20:00 · tarde"
    Then the calendar has "2026-06-19" and "2026-06-20" selected
    And the hours summary shows "sáb 20 jun" with "20:00"

  Scenario: A phrase understood in part lists every notice that applies
    When I ask for "el viernes por la tarde, el sábado a medianoche y el 31 de junio"
    Then the calendar has "2026-06-19" and "2026-06-21" selected
    And I see the notices:
      | vie 19 jun: hemos marcado el día, pero no hemos entendido la hora («por la tarde»). Elígela en el paso siguiente. |
      | dom 21 jun: la medianoche del sábado es el domingo a las 0:00.                                                    |
      | Hay algo que no encaja en tu petición («el 31 de junio»). Revísala e inténtalo de nuevo.                         |

  Scenario: Text that is not understood keeps the previous selection
    Given I have chosen "2026-07-06" on the calendar
    When I ask for "algún día"
    Then the smart calendar stays open with a notice that the text was not understood
    And "2026-07-06" is still selected

  Scenario: More than 60 options marks nothing
    When I ask for "todos los días hasta el 31 de diciembre"
    Then the smart calendar stays open with the notice "Son demasiadas fechas (máximo 60). Acota tu petición."
    And no date is selected yet

  Scenario: Replacing a selection can be undone
    Given I have chosen "2026-07-06", "2026-07-08" and "2026-07-10" on the calendar
    When I ask for "todos los lunes de julio"
    Then I see "Hemos sustituido las 3 fechas que tenías marcadas."
    When I choose "Deshacer"
    Then the calendar has "2026-07-06", "2026-07-08" and "2026-07-10" selected

  Scenario: A time range past 6:00 of the next day keeps the day without a time
    When I ask for "el viernes de 22 a 8"
    Then the calendar has "2026-06-19" selected
    And I see the notices:
      | vie 19 jun: hemos marcado el día, pero un horario puede terminar como mucho a las 6:00 del día siguiente. Elige la hora en el paso siguiente. |

  Scenario: A date already past and a date beyond 12 months are not marked
    When I ask for "el 1 de junio, el 20 de junio y el 1 de julio de 2027"
    Then the calendar has "2026-06-20" selected
    And I see the notices:
      | La fecha ya pasó («el 1 de junio»). Revísala e inténtalo de nuevo. |
      | Solo puedes proponer fechas de los próximos 12 meses.              |

  Scenario: A question about a time range
    When I ask for "el sábado de 5 a 7"
    Then I see the question "«de 5 a 7» del sáb 20 jun: ¿mañana o tarde?"
    When I answer "17:00 → 19:00 · tarde"
    Then the hours summary shows "sáb 20 jun" with "17:00 ⬇ 19:00"

  Scenario: The generate button waits for the answer
    Given the text editor answers slowly
    When I ask for "todos los lunes de julio"
    Then I cannot ask again until the answer arrives

  Scenario: Interpreted dates can be corrected by hand
    Given I have asked for "todos los lunes de julio"
    When I remove "2026-07-20" on the calendar and add "2026-07-22"
    Then the event is created with "2026-07-06", "2026-07-13", "2026-07-22" and "2026-07-27"

  Scenario: Dates in figures follow the browser's region
    Given my browser's language is "en-US"
    When I ask for "7/4 at 9pm"
    Then the calendar has "2026-07-04" selected

  Scenario: An empty request is not sent
    When I ask for ""
    Then no request reaches the interpreter

  Scenario Outline: A failing editor never stops the reading
    Given the text editor will <failure>
    When I ask for "todos los lunes de julio"
    Then the calendar has "2026-07-06", "2026-07-13", "2026-07-20" and "2026-07-27" selected

    Examples:
      | failure                               |
      | fail                                  |
      | time out                              |
      | answer a phrase with different numbers |

  Scenario: The API cannot be reached
    Given the qando API cannot be reached
    When I ask for "todos los lunes de julio"
    Then I see "No se ha podido interpretar"
    And the text I typed is still there
    And I can choose dates on the calendar by hand

  Scenario: Too many requests are limited
    Given I have made the maximum number of requests allowed
    When I ask for "todos los lunes de julio"
    Then I see "Demasiadas peticiones, inténtalo en un momento"

  Scenario: The browser never calls the AI provider
    When I ask for "todos los lunes de julio"
    Then the browser never called an AI provider
    And the page and its scripts contain no AI credentials
